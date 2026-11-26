// Package billing defines organization subscriptions and their entitlements.
package billing

import (
	_ "embed"
	"encoding/json"
	"errors"
	"time"

	"cascadehook/internal/accounts"
)

var (
	ErrUnavailable = errors.New("billing is not configured")
	ErrConflict    = errors.New("billing has an active subscription or unresolved checkout")
	ErrInvalidPlan = errors.New("invalid billing plan or interval")
	ErrMismatch    = errors.New("provider subscription does not match the configured offering")
	// ErrPaymentPending is temporary: Dodo confirms the first payment a few minutes after activation.
	ErrPaymentPending = errors.New("first subscription payment is not confirmed yet")
)

type Plan struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	MonthlyCents  int             `json:"monthly_cents"`
	AnnualCents   int             `json:"annual_cents"`
	RetentionDays int             `json:"retention_days"`
	Limits        accounts.Quotas `json:"limits"`
}

//go:embed plans.json
var catalog []byte

// The same checked-in catalog is imported by the public pricing page.
func Plans() []Plan {
	var plans []Plan
	if err := json.Unmarshal(catalog, &plans); err != nil {
		panic("invalid embedded billing catalog")
	}
	return plans
}

func FindPlan(id string) (Plan, bool) {
	for _, plan := range Plans() {
		if plan.ID == id {
			return plan, true
		}
	}
	return Plan{}, false
}

type State struct {
	Plan              string     `json:"plan"`
	Interval          string     `json:"interval"`
	Status            string     `json:"status"`
	PaidThrough       *time.Time `json:"paid_through"`
	AccessUntil       *time.Time `json:"access_until"`
	CancelAtPeriodEnd bool       `json:"cancel_at_period_end"`
	HasSubscription   bool       `json:"has_subscription"`
	CanCheckout       bool       `json:"can_checkout"`
	CheckoutPending   bool       `json:"checkout_pending"`
	CheckoutPlan      string     `json:"checkout_plan"`
	CheckoutInterval  string     `json:"checkout_interval"`
	RetentionDays     int        `json:"retention_days"`
	ScheduledPlan     string     `json:"scheduled_plan"`
	ScheduledInterval string     `json:"scheduled_interval"`
	ScheduledAt       *time.Time `json:"scheduled_at"`
	ActivationIssue   bool       `json:"activation_issue"`
	Amount            *int       `json:"amount"`
	Currency          string     `json:"currency"`
	DiscountPercent   *int       `json:"discount_percent"`
	DiscountCycles    *int       `json:"discount_cycles"`
}

var intervalRank = map[string]int{"monthly": 0, "annual": 1}

func planRank(id string) int {
	for index, plan := range Plans() {
		if plan.ID == id {
			return index
		}
	}
	return -1
}

// Upgrade reports whether a change applies now. It needs a plan at least as high and
// an interval at least as long, so the prorated charge never has to credit the customer.
// Everything else waits for the renewal.
func Upgrade(fromPlan, fromInterval, toPlan, toInterval string) bool {
	from, to := planRank(fromPlan), planRank(toPlan)
	fromLength, okFrom := intervalRank[fromInterval]
	toLength, okTo := intervalRank[toInterval]
	if from < 0 || to < 0 || !okFrom || !okTo || (from == to && fromLength == toLength) {
		return false
	}
	return to >= from && toLength >= fromLength
}
