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
}
