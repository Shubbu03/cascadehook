package billing

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"sync"
	"time"
)

var countryPattern = regexp.MustCompile(`^[A-Z]{2}$`)

// LocalPrice is a plan's recurring price in the customer's currency, after country pricing
// and before tax and discounts, as Dodo would charge it at checkout.
type LocalPrice struct {
	Amount   int    `json:"amount"`
	Currency string `json:"currency"`
}

type localPriceCache struct {
	mu      sync.Mutex
	entries map[string]localPriceEntry
}

type localPriceEntry struct {
	prices  map[string]LocalPrice
	fetched time.Time
}

const localPriceTTL = time.Hour

func (p *Provider) previewPrice(ctx context.Context, product, country string) (LocalPrice, error) {
	var result struct {
		Currency  string `json:"currency"`
		Recurring *struct {
			Subtotal int `json:"subtotal"`
		} `json:"recurring_breakup"`
	}
	body := map[string]any{
		"product_cart":    []map[string]any{{"product_id": product, "quantity": 1}},
		"billing_address": map[string]string{"country": country},
	}
	if err := p.request(ctx, http.MethodPost, "/checkouts/preview", body, &result); err != nil {
		return LocalPrice{}, err
	}
	if result.Recurring == nil || result.Currency == "" {
		return LocalPrice{}, ErrMismatch
	}
	return LocalPrice{Amount: result.Recurring.Subtotal, Currency: result.Currency}, nil
}

// LocalPrices prices every paid offering for one billing country through Dodo's side-effect-free
// checkout preview, keyed "plan:interval". Results are cached per country for an hour.
func (p *Provider) LocalPrices(ctx context.Context, country string) (map[string]LocalPrice, error) {
	if !countryPattern.MatchString(country) {
		return nil, ErrMismatch
	}
	p.localPrices.mu.Lock()
	if entry, ok := p.localPrices.entries[country]; ok && time.Since(entry.fetched) < localPriceTTL {
		p.localPrices.mu.Unlock()
		return entry.prices, nil
	}
	p.localPrices.mu.Unlock()

	prices := map[string]LocalPrice{}
	var mu sync.Mutex
	var wait sync.WaitGroup
	var errs []error
	for _, plan := range []string{"starter", "growth"} {
		for _, interval := range []string{"monthly", "annual"} {
			product, err := p.config.Product(plan, interval)
			if err != nil {
				return nil, err
			}
			wait.Add(1)
			go func(key, product string) {
				defer wait.Done()
				price, err := p.previewPrice(ctx, product, country)
				mu.Lock()
				defer mu.Unlock()
				if err != nil {
					errs = append(errs, err)
					return
				}
				prices[key] = price
			}(plan+":"+interval, product)
		}
	}
	wait.Wait()
	if err := errors.Join(errs...); err != nil {
		return nil, err
	}
	p.localPrices.mu.Lock()
	if p.localPrices.entries == nil {
		p.localPrices.entries = map[string]localPriceEntry{}
	}
	p.localPrices.entries[country] = localPriceEntry{prices: prices, fetched: time.Now()}
	p.localPrices.mu.Unlock()
	return prices, nil
}
