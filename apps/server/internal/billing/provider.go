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
	config Config
	client *http.Client
	base   string
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

type Checkout struct {
	ID  string `json:"session_id"`
	URL string `json:"checkout_url"`
}

type Subscription struct {
	ScheduledChange *struct {
		Product     string    `json:"product_id"`
		EffectiveAt time.Time `json:"effective_at"`
	} `json:"scheduled_change"`
	ID              string            `json:"subscription_id"`
	Product         string            `json:"product_id"`
	Status          string            `json:"status"`
	Currency        string            `json:"currency"`
	Amount          int               `json:"recurring_pre_tax_amount"`
	Quantity        int               `json:"quantity"`
	TrialDays       int               `json:"trial_period_days"`
	OnDemand        bool              `json:"on_demand"`
	Interval        string            `json:"payment_frequency_interval"`
	Frequency       int               `json:"payment_frequency_count"`
	CreatedAt       time.Time         `json:"created_at"`
	PreviousBilling time.Time         `json:"previous_billing_date"`
	NextBilling     time.Time         `json:"next_billing_date"`
	CancelAtEnd     bool              `json:"cancel_at_next_billing_date"`
	Metadata        map[string]string `json:"metadata"`
	Customer        struct {
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

func (p *Provider) Checkout(ctx context.Context, org, operation, product, customer string) (Checkout, error) {
	body := map[string]any{"product_cart": []map[string]any{{"product_id": product, "quantity": 1}}, "return_url": strings.TrimRight(p.config.AppURL, "/") + "/dashboard/organizations/" + org + "/billing?checkout=returned", "metadata": map[string]string{"cascadehook_organization": org, "cascadehook_checkout": operation}, "feature_flags": map[string]bool{"allow_discount_code": false, "allow_currency_selection": false}}
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

func (p *Provider) Portal(ctx context.Context, customer string) (string, error) {
	if !safeID(customer) {
		return "", ErrMismatch
	}
	var result struct {
		Link string `json:"link"`
	}
	err := p.request(ctx, http.MethodPost, "/customers/"+url.PathEscape(customer)+"/customer-portal/session?send_email=false&return_url="+url.QueryEscape(strings.TrimRight(p.config.AppURL, "/")+"/dashboard"), nil, &result)
	if err == nil && !checkoutURL(result.Link) {
		err = fmt.Errorf("invalid Dodo portal response")
	}
	return result.Link, err
}

func (p *Provider) ValidateSubscription(s Subscription) (Plan, string, error) {
	plan, interval, err := p.config.Offering(s.Product)
	if err != nil {
		return plan, interval, err
	}
	expected, frequency := plan.MonthlyCents, "month"
	if interval == "annual" {
		expected, frequency = plan.AnnualCents, "year"
	}
	if s.Currency != "USD" || s.Amount != expected || s.Quantity != 1 || s.TrialDays != 0 || s.OnDemand || !strings.EqualFold(s.Interval, frequency) || s.Frequency != 1 || !safeID(s.Customer.ID) || s.CreatedAt.IsZero() {
		return Plan{}, "", ErrMismatch
	}
	switch s.Status {
	case "pending", "active", "on_hold", "past_due", "paused", "cancelled", "failed", "expired":
	default:
		return Plan{}, "", ErrMismatch
	}
	if s.Status == "active" && (s.PreviousBilling.IsZero() || !s.NextBilling.After(s.PreviousBilling)) {
		return Plan{}, "", ErrMismatch
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

// ScheduleChange avoids charging a saved card from an application button.
// The replacement product is collected at renewal; failed payment preserves the old plan.
func (p *Provider) ScheduleChange(ctx context.Context, subscription, product string) error {
	if !safeID(subscription) {
		return ErrMismatch
	}
	return p.request(ctx, http.MethodPost, "/subscriptions/"+url.PathEscape(subscription)+"/change-plan", map[string]any{
		"product_id": product, "quantity": 1, "proration_billing_mode": "full_immediately",
		"effective_at": "next_billing_date", "on_payment_failure": "prevent_change",
		"cancel_scheduled_change_plan": true,
	}, nil)
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
