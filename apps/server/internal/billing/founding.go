package billing

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"sync"
	"time"
)

type discount struct {
	Code         string     `json:"code"`
	Type         string     `json:"type"`
	Amount       int        `json:"amount"`
	TimesUsed    int        `json:"times_used"`
	UsageLimit   *int       `json:"usage_limit"`
	StartsAt     *time.Time `json:"starts_at"`
	ExpiresAt    *time.Time `json:"expires_at"`
	Cycles       *int       `json:"subscription_cycles"`
	RestrictedTo []string   `json:"restricted_to"`
}

func (d discount) open(now time.Time) bool {
	return (d.StartsAt == nil || !d.StartsAt.After(now)) && (d.ExpiresAt == nil || d.ExpiresAt.After(now)) &&
		(d.UsageLimit == nil || d.TimesUsed < *d.UsageLimit)
}

// FoundingOffer is public: it backs the founding price on the pricing page.
type FoundingOffer struct {
	Active    bool `json:"active"`
	Percent   int  `json:"percent"`
	Remaining int  `json:"remaining"`
	Limit     int  `json:"limit"`
	Months    int  `json:"months"`
}

type foundingCache struct {
	mu      sync.Mutex
	offer   FoundingOffer
	used    int
	fetched time.Time
	failed  time.Time
}

const (
	foundingCacheTTL = 5 * time.Minute
	// A failed lookup is not retried for a minute, so a slow Dodo API cannot slow every page view.
	foundingRetryAfter = time.Minute
)

func (p *Provider) discount(ctx context.Context, code string) (discount, error) {
	var result discount
	err := p.request(ctx, http.MethodGet, "/discounts/code/"+url.PathEscape(code), nil, &result)
	return result, err
}

// Founding enforces one shared limit across the monthly and annual codes, since Dodo counts
// each code separately. carried is the number of organizations that redeemed both codes by
// switching interval, so each founding organization takes one spot. The cache keeps
// pricing-page traffic off the Dodo API.
func (p *Provider) Founding(ctx context.Context, carried int) (FoundingOffer, error) {
	if !p.config.FoundingEnabled() {
		return FoundingOffer{}, nil
	}
	p.founding.mu.Lock()
	defer p.founding.mu.Unlock()
	withSpots := func(offer FoundingOffer, used int) FoundingOffer {
		offer.Remaining = max(0, offer.Limit-(used-carried))
		offer.Active = offer.Active && offer.Remaining > 0
		return offer
	}
	if !p.founding.fetched.IsZero() && time.Since(p.founding.fetched) < foundingCacheTTL {
		return withSpots(p.founding.offer, p.founding.used), nil
	}
	if !p.founding.failed.IsZero() && time.Since(p.founding.failed) < foundingRetryAfter {
		return withSpots(p.founding.offer, p.founding.used), ErrUnavailable
	}
	var monthly, annual discount
	var monthlyErr, annualErr error
	var wait sync.WaitGroup
	wait.Add(2)
	go func() { defer wait.Done(); monthly, monthlyErr = p.discount(ctx, p.config.FoundingMonthlyCode) }()
	go func() { defer wait.Done(); annual, annualErr = p.discount(ctx, p.config.FoundingAnnualCode) }()
	wait.Wait()
	if err := errors.Join(monthlyErr, annualErr); err != nil {
		p.founding.failed = time.Now()
		return withSpots(p.founding.offer, p.founding.used), err
	}
	now := time.Now()
	offer := FoundingOffer{Limit: p.config.FoundingLimit}
	used := monthly.TimesUsed + annual.TimesUsed
	// Percentage codes store basis points; both codes must offer the same discount.
	if monthly.Type == "percentage" && annual.Type == "percentage" && monthly.Amount == annual.Amount && monthly.Amount > 0 && monthly.Amount < 10000 && monthly.Amount%100 == 0 {
		offer.Percent = monthly.Amount / 100
	}
	if monthly.Cycles != nil {
		offer.Months = *monthly.Cycles
	}
	// Active here means the codes are usable; withSpots also requires a spot left.
	offer.Active = offer.Percent > 0 && monthly.open(now) && annual.open(now)
	p.founding.offer, p.founding.used, p.founding.fetched, p.founding.failed = offer, used, now, time.Time{}
	return withSpots(offer, used), nil
}
