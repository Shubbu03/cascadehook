package billing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"
)

func testConfig() Config {
	return Config{
		APIKey: "test-key", Environment: "test_mode", AppURL: "https://cascadehook.example",
		WebhookKey:     "whsec_" + base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef")),
		StarterMonthly: "pdt_starter_m", StarterAnnual: "pdt_starter_y", GrowthMonthly: "pdt_growth_m", GrowthAnnual: "pdt_growth_y",
	}
}

func sign(t *testing.T, secret, id string, at time.Time, body []byte) http.Header {
	t.Helper()
	key, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
	if err != nil {
		t.Fatal(err)
	}
	stamp := strconv.FormatInt(at.Unix(), 10)
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(id + "." + stamp + "."))
	mac.Write(body)
	headers := http.Header{}
	headers.Set("webhook-id", id)
	headers.Set("webhook-timestamp", stamp)
	headers.Set("webhook-signature", "v1,"+base64.StdEncoding.EncodeToString(mac.Sum(nil)))
	return headers
}

func TestVerifyWebhook(t *testing.T) {
	config := testConfig()
	now := time.Unix(1_800_000_000, 0)
	body := []byte(`{"business_id":"bus_1","type":"subscription.active","timestamp":"2027-01-15T08:00:00Z",
		"data":{"subscription_id":"sub_1","metadata":{"cascadehook_organization":"org","seats":3,"trial":false}}}`)

	event, err := config.VerifyWebhook(body, sign(t, config.WebhookKey, "msg_1", now, body), now)
	if err != nil {
		t.Fatalf("valid webhook rejected: %v", err)
	}
	if event.ID != "msg_1" || event.Data.SubscriptionID != "sub_1" || event.Data.Metadata["cascadehook_organization"] != "org" {
		t.Fatalf("unexpected event: %+v", event)
	}
	if _, ok := event.Data.Metadata["seats"]; ok {
		t.Fatal("non-string metadata should be dropped, not decoded")
	}

	rotated := sign(t, config.WebhookKey, "msg_1", now, body)
	rotated.Set("webhook-signature", "v1,"+base64.StdEncoding.EncodeToString([]byte("previous-secret-signature-bytes!"))+" "+rotated.Get("webhook-signature"))
	if _, err := config.VerifyWebhook(body, rotated, now); err != nil {
		t.Fatalf("a matching signature among several should pass: %v", err)
	}

	cases := map[string]func() ([]byte, http.Header, time.Time){
		"tampered body": func() ([]byte, http.Header, time.Time) {
			return []byte(strings.Replace(string(body), "sub_1", "sub_2", 1)), sign(t, config.WebhookKey, "msg_1", now, body), now
		},
		"stale timestamp": func() ([]byte, http.Header, time.Time) {
			return body, sign(t, config.WebhookKey, "msg_1", now.Add(-6*time.Minute), body), now
		},
		"other secret": func() ([]byte, http.Header, time.Time) {
			other := "whsec_" + base64.StdEncoding.EncodeToString([]byte("another-secret-of-thirty-two-b!!"))
			return body, sign(t, other, "msg_1", now, body), now
		},
		"missing id": func() ([]byte, http.Header, time.Time) {
			headers := sign(t, config.WebhookKey, "msg_1", now, body)
			headers.Del("webhook-id")
			return body, headers, now
		},
		"subscription event without id": func() ([]byte, http.Header, time.Time) {
			empty := []byte(`{"type":"subscription.active","timestamp":"2027-01-15T08:00:00Z","data":{}}`)
			return empty, sign(t, config.WebhookKey, "msg_2", now, empty), now
		},
	}
	for name, build := range cases {
		t.Run(name, func(t *testing.T) {
			payload, headers, at := build()
			if _, err := config.VerifyWebhook(payload, headers, at); err == nil {
				t.Fatal("expected rejection")
			}
		})
	}
}

func validSubscription() Subscription {
	sub := Subscription{
		ID: "sub_1", Product: "pdt_starter_m", Status: "active", Currency: "USD", Amount: 900, Quantity: 1,
		Interval: "Month", Frequency: 1, CreatedAt: time.Unix(1_800_000_000, 0),
		PreviousBilling: time.Unix(1_800_000_000, 0), NextBilling: time.Unix(1_802_592_000, 0),
	}
	sub.Customer.ID = "cus_1"
	return sub
}

func TestValidateSubscription(t *testing.T) {
	config := testConfig()
	plan, interval, err := config.ValidateSubscription(validSubscription())
	if err != nil || plan.ID != "starter" || interval != "monthly" {
		t.Fatalf("got %s %s %v", plan.ID, interval, err)
	}
	cases := map[string]struct {
		edit   func(*Subscription)
		reason string
	}{
		"unknown product":  {func(s *Subscription) { s.Product = "pdt_other" }, "not one of the configured products"},
		"above list price": {func(s *Subscription) { s.Amount = 1200 }, "above the 900 list price"},
		"no amount":        {func(s *Subscription) { s.Amount = 0 }, "no recurring amount"},
		"quantity":         {func(s *Subscription) { s.Quantity = 2 }, "quantity"},
		"trial":            {func(s *Subscription) { s.TrialDays = 14 }, "trial"},
		"wrong interval":   {func(s *Subscription) { s.Interval = "Year" }, "bills every"},
		"no customer":      {func(s *Subscription) { s.Customer.ID = "" }, "no customer"},
		"unknown status":   {func(s *Subscription) { s.Status = "suspended" }, "unknown status"},
	}
	for name, test := range cases {
		t.Run(name, func(t *testing.T) {
			sub := validSubscription()
			test.edit(&sub)
			_, _, err := config.ValidateSubscription(sub)
			if !errors.Is(err, ErrMismatch) || !strings.Contains(err.Error(), test.reason) {
				t.Fatalf("got %v, want mismatch mentioning %q", err, test.reason)
			}
		})
	}
	for name, edit := range map[string]func(*Subscription){
		"parity price in rupees": func(s *Subscription) { s.Currency = "INR"; s.Amount = 38_000 },
		"founding discount":      func(s *Subscription) { s.Amount = 585 },
	} {
		sub := validSubscription()
		edit(&sub)
		if _, _, err := config.ValidateSubscription(sub); err != nil {
			t.Errorf("%s rejected: %v", name, err)
		}
	}
	annual := validSubscription()
	annual.Product, annual.Amount, annual.Interval = "pdt_growth_y", 29_000, "Year"
	if plan, interval, err := config.ValidateSubscription(annual); err != nil || plan.ID != "growth" || interval != "annual" {
		t.Fatalf("annual growth rejected: %s %s %v", plan.ID, interval, err)
	}
}

func TestUpgrade(t *testing.T) {
	cases := []struct {
		fromPlan, fromInterval, toPlan, toInterval string
		immediate                                  bool
	}{
		{"starter", "monthly", "growth", "monthly", true},
		{"starter", "monthly", "starter", "annual", true},
		{"starter", "monthly", "growth", "annual", true},
		{"starter", "annual", "growth", "annual", true},
		{"growth", "monthly", "starter", "monthly", false},
		{"starter", "annual", "starter", "monthly", false},
		{"starter", "annual", "growth", "monthly", false},
		{"growth", "annual", "growth", "annual", false},
		{"free", "", "starter", "monthly", false},
		{"legacy", "monthly", "growth", "monthly", false},
	}
	for _, test := range cases {
		if got := Upgrade(test.fromPlan, test.fromInterval, test.toPlan, test.toInterval); got != test.immediate {
			t.Errorf("%s/%s -> %s/%s: got %v", test.fromPlan, test.fromInterval, test.toPlan, test.toInterval, got)
		}
	}
}

func TestChangeBody(t *testing.T) {
	now := changeBody(PlanChange{Product: "pdt_growth_m", Immediate: true})
	if now["effective_at"] != "immediately" || now["proration_billing_mode"] != "prorated_immediately_keep_cycle" || now["on_payment_failure"] != "prevent_change" {
		t.Fatalf("upgrade body: %v", now)
	}
	later := changeBody(PlanChange{Product: "pdt_starter_m"})
	if later["effective_at"] != "next_billing_date" || later["on_payment_failure"] != "prevent_change" {
		t.Fatalf("downgrade body: %v", later)
	}
}

func TestSubscriptionDecodesMixedMetadata(t *testing.T) {
	var sub Subscription
	raw := `{"subscription_id":"sub_1","metadata":{"cascadehook_organization":"org","cascadehook_checkout":"op","count":2,"flag":true}}`
	if err := json.Unmarshal([]byte(raw), &sub); err != nil {
		t.Fatal(err)
	}
	if sub.Metadata["cascadehook_organization"] != "org" || len(sub.Metadata) != 2 {
		t.Fatalf("metadata: %v", sub.Metadata)
	}
}

func TestConfigValidate(t *testing.T) {
	if err := testConfig().Validate(); err != nil {
		t.Fatal(err)
	}
	duplicate := testConfig()
	duplicate.GrowthAnnual = duplicate.StarterMonthly
	if duplicate.Validate() == nil {
		t.Fatal("duplicate product IDs accepted")
	}
	oneCode := testConfig()
	oneCode.FoundingMonthlyCode, oneCode.FoundingLimit = "FOUNDING35", 50
	if oneCode.Validate() == nil {
		t.Fatal("a monthly founding code without an annual one was accepted")
	}
	both := oneCode
	both.FoundingAnnualCode = "FOUNDING35Y"
	if err := both.Validate(); err != nil || both.FoundingCode("annual") != "FOUNDING35Y" || both.FoundingCode("monthly") != "FOUNDING35" {
		t.Fatalf("founding codes: %v", err)
	}
	plainHTTP := testConfig()
	plainHTTP.Environment, plainHTTP.AppURL = "live_mode", "http://cascadehook.example"
	if plainHTTP.Validate() == nil {
		t.Fatal("live mode accepted a plain HTTP app URL")
	}
}

func TestDiscountOpen(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	limit := 50
	past, future := now.Add(-time.Hour), now.Add(time.Hour)
	if !(discount{UsageLimit: &limit, TimesUsed: 49, StartsAt: &past, ExpiresAt: &future}).open(now) {
		t.Fatal("open discount reported closed")
	}
	for name, d := range map[string]discount{
		"used up":     {UsageLimit: &limit, TimesUsed: 50},
		"not started": {StartsAt: &future},
		"expired":     {ExpiresAt: &past},
	} {
		if d.open(now) {
			t.Errorf("%s discount reported open", name)
		}
	}
}

func TestRenewalAmountAppliesActiveDiscounts(t *testing.T) {
	eleven, none := 11, 0
	sub := Subscription{Amount: 270, Discounts: []Discount{{Type: "percentage", Amount: 4000, CyclesRemaining: &eleven}}}
	if amount, percent, cycles := sub.RenewalAmount(); amount != 162 || percent != 40 || cycles == nil || *cycles != 11 {
		t.Fatalf("got %d %d %v", amount, percent, cycles)
	}
	sub.Discounts[0].CyclesRemaining = &none
	if amount, percent, _ := sub.RenewalAmount(); amount != 270 || percent != 0 {
		t.Fatalf("used-up discount still applied: %d %d", amount, percent)
	}
}

func TestFoundingCarry(t *testing.T) {
	config := testConfig()
	config.FoundingMonthlyCode, config.FoundingAnnualCode, config.FoundingLimit = "FOUNDING40", "FOUNDING40Y", 50
	eleven, none := 11, 0
	sub := Subscription{Discounts: []Discount{{Code: "FOUNDING40", Type: "percentage", Amount: 4000, CyclesRemaining: &eleven}}}
	if code := config.FoundingCarry(sub, "monthly", "annual"); code != "FOUNDING40Y" {
		t.Fatalf("monthly to annual: %q", code)
	}
	if code := config.FoundingCarry(sub, "monthly", "monthly"); code != "" {
		t.Fatalf("same interval should rely on Dodo keeping the discount: %q", code)
	}
	sub.Discounts[0].CyclesRemaining = &none
	if code := config.FoundingCarry(sub, "monthly", "annual"); code != "" {
		t.Fatalf("used-up discount carried: %q", code)
	}
	other := Subscription{Discounts: []Discount{{Code: "SPRING10", Type: "percentage", Amount: 1000}}}
	if code := config.FoundingCarry(other, "monthly", "annual"); code != "" {
		t.Fatalf("non-founding discount carried: %q", code)
	}
	carried := changeBody(PlanChange{Product: "pdt_growth_y", Immediate: true, DiscountCode: "FOUNDING40Y"})
	if codes, _ := carried["discount_codes"].([]string); len(codes) != 1 || codes[0] != "FOUNDING40Y" {
		t.Fatalf("discount not in body: %v", carried)
	}
}

func TestDiscountNeverBlocksAChange(t *testing.T) {
	var seen []string
	attempt := func(change PlanChange) error {
		seen = append(seen, change.DiscountCode)
		if change.DiscountCode != "" {
			return &ProviderError{Status: 422}
		}
		return nil
	}
	applied, err := withoutDiscount(PlanChange{Product: "pdt_growth_y", DiscountCode: "FOUNDING40Y"}, attempt)
	if err != nil || applied || len(seen) != 2 || seen[1] != "" {
		t.Fatalf("applied=%v err=%v attempts=%q", applied, err, seen)
	}
	applied, err = withoutDiscount(PlanChange{Product: "pdt_growth_y", DiscountCode: "FOUNDING40Y"}, func(PlanChange) error { return nil })
	if err != nil || !applied {
		t.Fatalf("accepted code should count as applied: %v %v", applied, err)
	}
	_, err = withoutDiscount(PlanChange{Product: "pdt_growth_y", DiscountCode: "FOUNDING40Y"}, func(PlanChange) error { return &ProviderError{Status: 503} })
	if err == nil {
		t.Fatal("an outage must not be retried as a discount problem")
	}
}
