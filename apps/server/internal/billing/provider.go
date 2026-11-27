package billing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type ProviderError struct{ Status int }

func (e *ProviderError) Error() string { return fmt.Sprintf("Dodo request failed (HTTP %d)", e.Status) }
func DefinitiveRejection(err error) bool {
	var p *ProviderError
	if !errors.As(err, &p) {
		return false
	}
	return p.Status == 400 || p.Status == 401 || p.Status == 403 || p.Status == 404 || p.Status == 422
}

type Provider struct {
	config      Config
	client      *http.Client
	base        string
	founding    foundingCache
	localPrices localPriceCache
}

func NewProvider(cfg Config) (*Provider, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if !cfg.Enabled() {
		return nil, nil
	}
	base := "https://test.dodopayments.com"
	if cfg.Environment == "live_mode" {
		base = "https://live.dodopayments.com"
	}
	return &Provider{config: cfg, base: base, client: &http.Client{Timeout: 6 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }, Transport: &http.Transport{MaxConnsPerHost: 4, MaxIdleConns: 4, IdleConnTimeout: 60 * time.Second, TLSHandshakeTimeout: 3 * time.Second, ResponseHeaderTimeout: 5 * time.Second, MaxResponseHeaderBytes: 32 << 10, ForceAttemptHTTP2: true}}}, nil
}

func (p *Provider) Close() { p.client.CloseIdleConnections() }

func (p *Provider) PlanFor(product string) (Plan, string, error) { return p.config.Offering(product) }

type Checkout struct {
	ID  string `json:"session_id"`
	URL string `json:"checkout_url"`
}

type Discount struct {
	Code            string `json:"code"`
	Type            string `json:"type"`
	Amount          int    `json:"amount"`
	CyclesRemaining *int   `json:"cycles_remaining"`
}

// RenewalAmount applies active percentage discounts (basis points) to the recurring amount
// and reports the first one, so the owner sees what the next renewal actually costs.
func (s Subscription) RenewalAmount() (amount int, percent int, cycles *int) {
	amount = s.Amount
	for _, discount := range s.Discounts {
		if discount.Type != "percentage" || discount.Amount <= 0 || discount.Amount > 10000 || (discount.CyclesRemaining != nil && *discount.CyclesRemaining <= 0) {
			continue
		}
		amount = (amount*(10000-discount.Amount) + 5000) / 10000
		if percent == 0 {
			percent, cycles = discount.Amount/100, discount.CyclesRemaining
		}
	}
	return amount, percent, cycles
}

// Metadata keeps string values only. Dodo also allows numbers and booleans, and
// a value we never wrote must not make the whole subscription unreadable.
type Metadata map[string]string

func (m *Metadata) UnmarshalJSON(data []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	result := make(Metadata, len(raw))
	for key, value := range raw {
		var text string
		if json.Unmarshal(value, &text) == nil {
			result[key] = text
		}
	}
	*m = result
	return nil
}

type Subscription struct {
	ScheduledChange *struct {
		Product     string    `json:"product_id"`
		EffectiveAt time.Time `json:"effective_at"`
	} `json:"scheduled_change"`
	ID              string     `json:"subscription_id"`
	Product         string     `json:"product_id"`
	Status          string     `json:"status"`
	Currency        string     `json:"currency"`
	Amount          int        `json:"recurring_pre_tax_amount"`
	Quantity        int        `json:"quantity"`
	TrialDays       int        `json:"trial_period_days"`
	OnDemand        bool       `json:"on_demand"`
	Interval        string     `json:"payment_frequency_interval"`
	Frequency       int        `json:"payment_frequency_count"`
	CreatedAt       time.Time  `json:"created_at"`
	PreviousBilling time.Time  `json:"previous_billing_date"`
	NextBilling     time.Time  `json:"next_billing_date"`
	CancelAtEnd     bool       `json:"cancel_at_next_billing_date"`
	Metadata        Metadata   `json:"metadata"`
	Discounts       []Discount `json:"discounts"`
	Billing         struct {
		Country string `json:"country"`
	} `json:"billing"`
	Customer struct {
		ID string `json:"customer_id"`
	} `json:"customer"`
}

func (p *Provider) Subscription(ctx context.Context, id string) (Subscription, error) {
	var result Subscription
	if !safeID(id) {
		return result, ErrMismatch
	}
	err := p.request(ctx, http.MethodGet, "/subscriptions/"+url.PathEscape(id), nil, &result)
	if err == nil && result.ID != id {
		err = ErrMismatch
	}
	return result, err
}

func (p *Provider) billingPage(org string) string {
	return strings.TrimRight(p.config.AppURL, "/") + "/dashboard/organizations/" + url.PathEscape(org) + "/billing"
}

// Customers cannot enter codes; a founding code chosen by the server still applies.
// Currency and country pricing come from Dodo's Adaptive Currency and parity settings.
func (p *Provider) Checkout(ctx context.Context, org, operation, product, customer, discountCode string) (Checkout, error) {
	page := p.billingPage(org)
	body := map[string]any{
		"product_cart":  []map[string]any{{"product_id": product, "quantity": 1}},
		"return_url":    page + "?checkout=returned",
		"cancel_url":    page + "?checkout=cancelled",
		"metadata":      map[string]string{"cascadehook_organization": org, "cascadehook_checkout": operation},
		"feature_flags": map[string]bool{"allow_discount_code": false},
	}
	if discountCode != "" {
		body["discount_codes"] = []string{discountCode}
	}
	if customer != "" {
		body["customer"] = map[string]string{"customer_id": customer}
	}
	var result Checkout
	err := p.request(ctx, http.MethodPost, "/checkouts", body, &result)
	if err == nil && (!safeID(result.ID) || !checkoutURL(result.URL)) {
		err = fmt.Errorf("invalid Dodo checkout response")
	}
	return result, err
}

func (p *Provider) Portal(ctx context.Context, customer, org string) (string, error) {
	if !safeID(customer) {
		return "", ErrMismatch
	}
	var result struct {
		Link string `json:"link"`
	}
	err := p.request(ctx, http.MethodPost, "/customers/"+url.PathEscape(customer)+"/customer-portal/session?send_email=false&return_url="+url.QueryEscape(p.billingPage(org)), nil, &result)
	if err == nil && !checkoutURL(result.Link) {
		err = fmt.Errorf("invalid Dodo portal response")
	}
	return result.Link, err
}

func (p *Provider) ValidateSubscription(s Subscription) (Plan, string, error) {
	return p.config.ValidateSubscription(s)
}

// ValidateSubscription names the first mismatch so an operator can fix the Dodo product
// instead of guessing. Reasons hold no secrets or payment details.
func (c Config) ValidateSubscription(s Subscription) (Plan, string, error) {
	mismatch := func(format string, args ...any) (Plan, string, error) {
		return Plan{}, "", fmt.Errorf("%w: "+format, append([]any{ErrMismatch}, args...)...)
	}
	plan, interval, err := c.Offering(s.Product)
	if err != nil {
		return mismatch("product %s is not one of the configured products", s.Product)
	}
	expected, frequency := plan.MonthlyCents, "month"
	if interval == "annual" {
		expected, frequency = plan.AnnualCents, "year"
	}
	// Parity pricing, local currencies, and the founding discount only lower the price,
	// so a USD amount may be below list but never above it.
	switch {
	case s.Currency == "" || s.Amount <= 0:
		return mismatch("subscription has no recurring amount")
	case s.Currency == "USD" && s.Amount > expected:
		return mismatch("pre-tax price is %d cents, above the %d list price; check the product price", s.Amount, expected)
	case s.Quantity != 1:
		return mismatch("quantity is %d, expected 1", s.Quantity)
	case s.TrialDays != 0:
		return mismatch("product has a %d-day trial; remove it", s.TrialDays)
	case s.OnDemand:
		return mismatch("subscription is on-demand")
	case !strings.EqualFold(s.Interval, frequency) || s.Frequency != 1:
		return mismatch("bills every %d %s, expected every 1 %s", s.Frequency, s.Interval, frequency)
	case !safeID(s.Customer.ID) || s.CreatedAt.IsZero():
		return mismatch("subscription has no customer or creation time")
	}
	switch s.Status {
	case "pending", "active", "on_hold", "past_due", "paused", "cancelled", "failed", "expired":
	default:
		return mismatch("unknown status %q", s.Status)
	}
	if s.Status == "active" && (s.PreviousBilling.IsZero() || !s.NextBilling.After(s.PreviousBilling)) {
		return mismatch("active subscription has no valid billing period")
	}
	return plan, interval, nil
}

func (p *Provider) request(ctx context.Context, method, path string, body, out any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, p.base+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	req.Header.Set("Content-Type", "application/json")
	response, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("Dodo request unavailable")
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if err != nil || len(data) > 1<<20 {
		return fmt.Errorf("invalid Dodo response")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return &ProviderError{Status: response.StatusCode}
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("invalid Dodo response")
	}
	return nil
}

func safeID(id string) bool {
	return id != "" && len(id) <= 200 && !strings.ContainsAny(id, "/\\ \t\r\n?#")
}
func checkoutURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.User == nil && u.Port() == "" && (u.Hostname() == "dodopayments.com" || strings.HasSuffix(u.Hostname(), ".dodopayments.com"))
}

// Upgrades apply now and charge the remaining part of the current period; the
// change waits for that payment, so a failed charge keeps the old plan. Other
// changes are collected at renewal, and a failed renewal keeps the old plan too.
// PlanChange describes a requested plan change. DiscountCode carries a founding discount
// to a plan on another billing interval, where the original code does not apply.
type PlanChange struct {
	Product      string
	Immediate    bool
	DiscountCode string
}

func changeBody(change PlanChange) map[string]any {
	body := map[string]any{"product_id": change.Product, "quantity": 1, "on_payment_failure": "prevent_change", "cancel_scheduled_change_plan": true}
	if change.DiscountCode != "" {
		body["discount_codes"] = []string{change.DiscountCode}
	}
	immediate := change.Immediate
	if immediate {
		body["effective_at"] = "immediately"
		body["proration_billing_mode"] = "prorated_immediately_keep_cycle"
	} else {
		body["effective_at"] = "next_billing_date"
		body["proration_billing_mode"] = "full_immediately"
	}
	return body
}

type ChangeResult struct {
	PaymentID       string `json:"payment_id"`
	PaymentLink     string `json:"payment_link"`
	DiscountApplied bool   `json:"-"`
}

func rejected(err error) bool {
	var provider *ProviderError
	return errors.As(err, &provider) && provider.Status == 422
}

// withoutDiscount retries a plan change without the carried founding code when Dodo rejects it,
// for example because the customer already used that code. A discount never blocks a change.
func withoutDiscount(change PlanChange, attempt func(PlanChange) error) (bool, error) {
	err := attempt(change)
	if change.DiscountCode == "" || !rejected(err) {
		return change.DiscountCode != "" && err == nil, err
	}
	change.DiscountCode = ""
	return false, attempt(change)
}

// ChangePlan sends an upgrade through Dodo's hosted checkout, so the customer confirms the
// charge and any bank authentication (3-D Secure, the Indian e-mandate cap) instead of a
// silent charge to the saved card. Without the payment-link setting it charges the saved card.
func (p *Provider) ChangePlan(ctx context.Context, subscription string, change PlanChange, org string) (ChangeResult, error) {
	var result ChangeResult
	if !safeID(subscription) {
		return result, ErrMismatch
	}
	path := "/subscriptions/" + url.PathEscape(subscription) + "/change-plan"
	send := func(linked bool) func(PlanChange) error {
		return func(attempt PlanChange) error {
			result = ChangeResult{}
			body := changeBody(attempt)
			if linked {
				body["collect_via_payment_link"] = true
				body["cancel_older_payment_link"] = true
				body["return_url"] = p.billingPage(org) + "?upgrade=returned"
			}
			return p.request(ctx, http.MethodPost, path, body, &result)
		}
	}
	applied, err := withoutDiscount(change, send(change.Immediate))
	// Without the payment-link setting Dodo rejects a linked request; charge the saved card instead.
	if change.Immediate && rejected(err) {
		applied, err = withoutDiscount(change, send(false))
	}
	result.DiscountApplied = applied
	if err == nil && result.PaymentLink != "" && !checkoutURL(result.PaymentLink) {
		err = fmt.Errorf("invalid Dodo payment link")
	}
	return result, err
}

// SafePaymentID reports whether a client-supplied payment ID is safe to look up.
func SafePaymentID(id string) bool { return strings.HasPrefix(id, "pay_") && safeID(id) }

type ChangePreview struct {
	DiscountApplied bool      `json:"-"`
	Total           int       `json:"total"`
	Tax             int       `json:"tax"`
	Currency        string    `json:"currency"`
	EffectiveAt     time.Time `json:"effective_at"`
}

// PreviewChange shows the exact amount before an owner confirms a charge to a saved payment method.
func (p *Provider) PreviewChange(ctx context.Context, subscription string, change PlanChange) (ChangePreview, error) {
	var result struct {
		Charge struct {
			EffectiveAt time.Time `json:"effective_at"`
			Summary     struct {
				Total    int    `json:"total_amount"`
				Tax      *int   `json:"tax"`
				Currency string `json:"currency"`
			} `json:"summary"`
		} `json:"immediate_charge"`
	}
	if !safeID(subscription) {
		return ChangePreview{}, ErrMismatch
	}
	applied, err := withoutDiscount(change, func(attempt PlanChange) error {
		return p.request(ctx, http.MethodPost, "/subscriptions/"+url.PathEscape(subscription)+"/change-plan/preview", changeBody(attempt), &result)
	})
	if err != nil {
		return ChangePreview{}, err
	}
	preview := ChangePreview{DiscountApplied: applied, Total: result.Charge.Summary.Total, Currency: result.Charge.Summary.Currency, EffectiveAt: result.Charge.EffectiveAt}
	if result.Charge.Summary.Tax != nil {
		preview.Tax = *result.Charge.Summary.Tax
	}
	return preview, nil
}

type CheckoutSession struct {
	ID            string    `json:"id"`
	CreatedAt     time.Time `json:"created_at"`
	PaymentID     string    `json:"payment_id"`
	PaymentStatus string    `json:"payment_status"`
}

func (p *Provider) CheckoutSession(ctx context.Context, id string) (CheckoutSession, error) {
	var result CheckoutSession
	if !safeID(id) {
		return result, ErrMismatch
	}
	err := p.request(ctx, http.MethodGet, "/checkouts/"+url.PathEscape(id), nil, &result)
	if err == nil && result.ID != id {
		err = ErrMismatch
	}
	return result, err
}

// Resume withdraws a cancellation that has not taken effect, so the subscription renews again.
func (p *Provider) Resume(ctx context.Context, subscription string) error {
	if !safeID(subscription) {
		return ErrMismatch
	}
	return p.request(ctx, http.MethodPatch, "/subscriptions/"+url.PathEscape(subscription), map[string]any{"cancel_at_next_billing_date": false}, nil)
}

func (p *Provider) CancelNow(ctx context.Context, subscription string) error {
	if !safeID(subscription) {
		return ErrMismatch
	}
	return p.request(ctx, http.MethodPatch, "/subscriptions/"+url.PathEscape(subscription), map[string]any{"status": "cancelled", "cancel_at_next_billing_date": false}, nil)
}

func (p *Provider) RefundedPayment(ctx context.Context, refund string) (string, error) {
	if !safeID(refund) {
		return "", ErrMismatch
	}
	var result struct {
		ID      string `json:"refund_id"`
		Payment string `json:"payment_id"`
		Status  string `json:"status"`
	}
	if err := p.request(ctx, http.MethodGet, "/refunds/"+url.PathEscape(refund), nil, &result); err != nil {
		return "", err
	}
	if result.ID != refund || result.Status != "succeeded" || !safeID(result.Payment) {
		return "", ErrMismatch
	}
	return result.Payment, nil
}

type Payment struct {
	ID             string   `json:"payment_id"`
	Subscription   string   `json:"subscription_id"`
	Subscriptions  []string `json:"subscription_ids"`
	RefundStatus   string   `json:"refund_status"`
	Status         string   `json:"status"`
	ServicePeriods []struct {
		Subscription string    `json:"subscription_id"`
		StartsAt     time.Time `json:"starts_at"`
		EndsAt       time.Time `json:"ends_at"`
	} `json:"service_periods"`
}

// Initial activation also checks the payment, including when cancellation arrived first.
func (p *Provider) ConfirmPaidPeriod(ctx context.Context, sub Subscription) (bool, error) {
	query := url.Values{"subscription_id": {sub.ID}, "status": {"succeeded"}, "page_size": {"10"}, "page_number": {"0"}}
	var result struct {
		Items []Payment `json:"items"`
	}
	if err := p.request(ctx, http.MethodGet, "/payments?"+query.Encode(), nil, &result); err != nil {
		return false, err
	}
	for _, payment := range result.Items {
		if payment.Status != "succeeded" || payment.RefundStatus == "full" {
			continue
		}
		for _, period := range payment.ServicePeriods {
			if period.Subscription == sub.ID && period.EndsAt.Equal(sub.NextBilling) && !period.StartsAt.IsZero() && period.EndsAt.After(period.StartsAt) {
				return true, nil
			}
		}
	}
	return false, nil
}

func (p *Provider) Payment(ctx context.Context, id string) (Payment, error) {
	var result Payment
	if !safeID(id) {
		return result, ErrMismatch
	}
	err := p.request(ctx, http.MethodGet, "/payments/"+url.PathEscape(id), nil, &result)
	if err == nil && result.ID != id {
		err = ErrMismatch
	}
	if result.Subscription == "" && len(result.Subscriptions) == 1 {
		result.Subscription = result.Subscriptions[0]
	}
	return result, err
}
