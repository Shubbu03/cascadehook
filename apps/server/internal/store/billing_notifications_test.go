package store

import (
	"slices"
	"strings"
	"testing"
	"time"

	"cascadehook/internal/billing"
)

func noticeKinds(notices []billingNotice) []string {
	kinds := make([]string, len(notices))
	for i, notice := range notices {
		kinds[i] = notice.Kind
	}
	return kinds
}

func TestBillingTransitions(t *testing.T) {
	now := time.Date(2026, 11, 26, 12, 0, 0, 0, time.UTC)
	renews, grace, past := now.AddDate(0, 1, 0), now.AddDate(0, 1, 3), now.Add(-time.Hour)
	active := billingSnapshot{Subscription: "sub_1", Plan: "starter", Interval: "monthly", Status: "active", PaidThrough: &renews, AccessUntil: &grace}
	with := func(change func(*billingSnapshot)) billingSnapshot {
		next := active
		change(&next)
		return next
	}
	cases := []struct {
		name       string
		prev, next billingSnapshot
		binding    bool
		want       []string
	}{
		{"purchase", billingSnapshot{}, active, true, []string{"activated"}},
		{"purchase not yet active", billingSnapshot{}, with(func(s *billingSnapshot) { s.Status = "cancelled" }), true, nil},
		{"renewal", active, active, false, nil},
		{"upgrade", active, with(func(s *billingSnapshot) { s.Plan = "growth" }), false, []string{"changed"}},
		{"downgrade scheduled", active, with(func(s *billingSnapshot) { s.Scheduled = "pdt_starter_monthly"; s.ScheduledAt = &renews }), false, []string{"scheduled"}},
		{"cancel at period end", active, with(func(s *billingSnapshot) { s.CancelAtEnd = true; s.AccessUntil = &renews }), false, []string{"cancelling"}},
		{"keep my plan", with(func(s *billingSnapshot) { s.CancelAtEnd = true }), active, false, []string{"resumed"}},
		{"renewal declined", active, with(func(s *billingSnapshot) { s.Status = "on_hold" }), false, []string{"payment_failed"}},
		{"renewal recovered", with(func(s *billingSnapshot) { s.Status = "on_hold" }), active, false, []string{"recovered"}},
		{"plan ended", with(func(s *billingSnapshot) { s.CancelAtEnd = true }), with(func(s *billingSnapshot) { s.Status = "cancelled"; s.CancelAtEnd = true; s.AccessUntil = &past }), false, []string{"ended"}},
		{"cancelled with paid time left", active, with(func(s *billingSnapshot) { s.Status = "cancelled"; s.AccessUntil = &renews }), false, []string{"cancelling"}},
		{"other subscription", active, with(func(s *billingSnapshot) { s.Subscription = "sub_2"; s.Plan = "growth" }), false, nil},
	}
	for _, tc := range cases {
		got := noticeKinds(billingTransitions(tc.prev, tc.next, tc.binding, now))
		if !slices.Equal(got, tc.want) && !(len(got) == 0 && len(tc.want) == 0) {
			t.Errorf("%s: got %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestBillingNoticeKeysRepeatOnlyForTheSameEvent(t *testing.T) {
	now := time.Now()
	first, second := now.AddDate(0, 1, 0), now.AddDate(0, 2, 0)
	prev := billingSnapshot{Subscription: "sub_1", Plan: "starter", Interval: "monthly", Status: "active", PaidThrough: &first}
	next := prev
	next.CancelAtEnd = true
	key := billingTransitions(prev, next, false, now)[0].Key
	if again := billingTransitions(prev, next, false, now)[0].Key; again != key {
		t.Fatalf("a redelivered cancellation got a new key: %s != %s", again, key)
	}
	later := next
	later.PaidThrough = &second
	if other := billingTransitions(prev, later, false, now)[0].Key; other == key {
		t.Fatal("a cancellation in a later period reused the earlier key")
	}
}

func TestBillingMessagesFitNotificationLimits(t *testing.T) {
	starter, _ := billing.FindPlan("starter")
	growth, _ := billing.FindPlan("growth")
	at := time.Date(2027, 11, 26, 0, 0, 0, 0, time.UTC)
	name := strings.Repeat("Organization ", 8)
	prev := billingSnapshot{Plan: "starter", Interval: "monthly"}
	next := billingSnapshot{Plan: "growth", Interval: "annual", PaidThrough: &at, AccessUntil: &at, ScheduledAt: &at}
	for _, kind := range []string{"activated", "changed", "scheduled", "cancelling", "resumed", "payment_failed", "recovered", "ended", "refunded"} {
		message := renderBillingNotice(kind, name, prev, next, growth, starter, starter, "monthly")
		if message.Title == "" || len(message.Title) > 160 || len(message.Body) > 600 {
			t.Errorf("%s: title %d, body %d characters", kind, len(message.Title), len(message.Body))
		}
		if strings.ContainsAny(message.Body, "$₹") {
			t.Errorf("%s names an amount", kind)
		}
	}
	if message := renderBillingNotice("changed", "Acme", prev, next, growth, starter, billing.Plan{}, ""); message.Severity != "success" {
		t.Errorf("upgrade severity %s", message.Severity)
	}
	if message := renderBillingNotice("changed", "Acme", next, prev, starter, growth, billing.Plan{}, ""); message.Severity != "info" {
		t.Errorf("downgrade severity %s", message.Severity)
	}
	if message := renderBillingNotice("cancelling", "Acme", prev, next, growth, starter, billing.Plan{}, ""); !strings.Contains(message.Body, "Keep my plan") || !strings.Contains(message.Body, "why you cancelled") {
		t.Error("cancellation notice lacks the keep-plan option or the feedback ask")
	}
}
