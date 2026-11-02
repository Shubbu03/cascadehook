package billing

import (
	"encoding/base64"
	"fmt"
	"net/url"
	"strings"
)

type Config struct {
	APIKey         string `json:"-"`
	WebhookKey     string `json:"-"`
	Environment    string
	AppURL         string
	StarterMonthly string
	StarterAnnual  string
	GrowthMonthly  string
	GrowthAnnual   string
}

func (c Config) Enabled() bool { return c.APIKey != "" }

func (c Config) Validate() error {
	if !c.Enabled() {
		if c.WebhookKey != "" {
			return fmt.Errorf("DODO_PAYMENTS_API_KEY is required with billing webhooks")
		}
		return nil
	}
	if c.Environment != "test_mode" && c.Environment != "live_mode" {
		return fmt.Errorf("DODO_PAYMENTS_ENVIRONMENT must be test_mode or live_mode")
	}
	u, err := url.Parse(c.AppURL)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return fmt.Errorf("BILLING_APP_URL must be an application origin")
	}
	local := u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1"
	if u.Scheme != "https" && !(c.Environment == "test_mode" && u.Scheme == "http" && local) {
		return fmt.Errorf("BILLING_APP_URL requires HTTPS (test mode permits HTTP loopback)")
	}
	key, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(c.WebhookKey, "whsec_"))
	if err != nil || !strings.HasPrefix(c.WebhookKey, "whsec_") || len(key) < 16 {
		return fmt.Errorf("DODO_PAYMENTS_WEBHOOK_KEY must be a whsec_ signing secret")
	}
	seen := map[string]bool{}
	for _, id := range []string{c.StarterMonthly, c.StarterAnnual, c.GrowthMonthly, c.GrowthAnnual} {
		if !strings.HasPrefix(id, "pdt_") || len(id) > 200 || strings.ContainsAny(id, " /\\\t\r\n") || seen[id] {
			return fmt.Errorf("configure four distinct Dodo subscription product IDs")
		}
		seen[id] = true
	}
	return nil
}

func (c Config) Product(plan, interval string) (string, error) {
	switch plan + ":" + interval {
	case "starter:monthly":
		return c.StarterMonthly, nil
	case "starter:annual":
		return c.StarterAnnual, nil
	case "growth:monthly":
		return c.GrowthMonthly, nil
	case "growth:annual":
		return c.GrowthAnnual, nil
	default:
		return "", ErrInvalidPlan
	}
}

func (c Config) Offering(product string) (Plan, string, error) {
	for _, plan := range Plans() {
		if plan.ID == "free" {
			continue
		}
		for _, interval := range []string{"monthly", "annual"} {
			id, _ := c.Product(plan.ID, interval)
			if id != "" && id == product {
				return plan, interval, nil
			}
		}
	}
	return Plan{}, "", ErrMismatch
}
