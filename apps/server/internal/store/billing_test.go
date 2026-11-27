package store

import (
	"context"
	"encoding/base64"
	"errors"
	"testing"
	"time"

	"cascadehook/internal/billing"
	"github.com/google/uuid"
)

type fakeBillingProvider struct {
	config billing.Config
	sub    billing.Subscription
	paid   bool
}

func (f *fakeBillingProvider) Subscription(_ context.Context, id string) (billing.Subscription, error) {
	if id != f.sub.ID {
		return billing.Subscription{}, billing.ErrMismatch
	}
	return f.sub, nil
}

func (f *fakeBillingProvider) ValidateSubscription(sub billing.Subscription) (billing.Plan, string, error) {
	return f.config.ValidateSubscription(sub)
}

func (f *fakeBillingProvider) PlanFor(product string) (billing.Plan, string, error) {
	return f.config.Offering(product)
}

func (f *fakeBillingProvider) ConfirmPaidPeriod(context.Context, billing.Subscription) (bool, error) {
	return f.paid, nil
}

type billingFixture struct {
	db         *Store
	user, org  uuid.UUID
	provider   *fakeBillingProvider
	checkoutID uuid.UUID
}

func newBillingFixture(t *testing.T) billingFixture {
	return newBillingFixtureFor(t, "pdt_starter_m", 900)
}

func newBillingFixtureFor(t *testing.T, product string, amount int) billingFixture {
	t.Helper()
	f := billingFixture{db: notificationTestStore(t), user: uuid.New(), org: uuid.New()}
	for _, query := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO users(id,identity_issuer,identity_subject) VALUES($1,'https://test.clerk.accounts.dev','user_billing_owner')`, []any{f.user}},
		{`INSERT INTO organizations(id,name) VALUES($1,'Billing organization')`, []any{f.org}},
		{`INSERT INTO memberships(organization_id,user_id,role) VALUES($1,$2,'owner')`, []any{f.org, f.user}},
	} {
		if _, err := f.db.pool.Exec(t.Context(), query.sql, query.args...); err != nil {
			t.Fatal(err)
		}
	}
	config := billing.Config{
		APIKey: "test", Environment: "test_mode", AppURL: "https://cascadehook.example",
		WebhookKey:     "whsec_" + base64.StdEncoding.EncodeToString([]byte("0123456789abcdef")),
		StarterMonthly: "pdt_starter_m", StarterAnnual: "pdt_starter_y", GrowthMonthly: "pdt_growth_m", GrowthAnnual: "pdt_growth_y",
	}
	record, created, err := f.db.ReserveBillingCheckout(t.Context(), f.user, f.org, product)
	if err != nil || !created {
		t.Fatalf("reserve checkout: created=%v err=%v", created, err)
	}
	f.checkoutID = record.CheckoutID
	if err := f.db.SaveBillingCheckout(t.Context(), f.org, f.checkoutID, "cks_1", "https://test.checkout.dodopayments.com/session/cks_1"); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	sub := billing.Subscription{
		ID: "sub_1", Product: product, Status: "active", Currency: "USD", Amount: amount, Quantity: 1,
		Interval: "Month", Frequency: 1, CreatedAt: now.Add(-time.Minute), PreviousBilling: now.Add(-time.Minute), NextBilling: now.AddDate(0, 1, 0),
		Metadata: billing.Metadata{"cascadehook_organization": f.org.String(), "cascadehook_checkout": f.checkoutID.String()},
	}
	sub.Customer.ID = "cus_1"
	f.provider = &fakeBillingProvider{config: config, sub: sub}
	return f
}

func (f billingFixture) entitlement(t *testing.T) (string, int64) {
	t.Helper()
	var plan string
	var deliveries int64
	if err := f.db.pool.QueryRow(t.Context(), `SELECT plan,max_monthly_deliveries FROM organization_entitlements WHERE id=$1`, f.org).Scan(&plan, &deliveries); err != nil {
		t.Fatal(err)
	}
	return plan, deliveries
}

func TestBillingActivationWaitsForPaymentAndIsIdempotent(t *testing.T) {
	f := newBillingFixture(t)
	ctx := t.Context()

	if err := f.db.SyncBilling(ctx, f.org, "sub_1", "evt_1", f.provider, true); !errors.Is(err, billing.ErrPaymentPending) {
		t.Fatalf("activation before payment: got %v, want ErrPaymentPending", err)
	}
	if plan, _ := f.entitlement(t); plan != "free" {
		t.Fatalf("plan before payment: %s", plan)
	}

	f.provider.paid = true
	if err := f.db.SyncBilling(ctx, f.org, "sub_1", "evt_1", f.provider, true); err != nil {
		t.Fatal(err)
	}
	record, err := f.db.GetBilling(ctx, f.org)
	if err != nil {
		t.Fatal(err)
	}
	if record.Plan != "starter" || record.Interval != "monthly" || record.CheckoutPending || !record.HasSubscription {
		t.Fatalf("activated record: %+v", record.State)
	}
	if want := f.provider.sub.NextBilling.Add(72 * time.Hour); record.AccessUntil == nil || !record.AccessUntil.Equal(want) {
		t.Fatalf("access until %v, want %v", record.AccessUntil, want)
	}
	if plan, deliveries := f.entitlement(t); plan != "starter" || deliveries != 100_000 {
		t.Fatalf("entitlement %s %d", plan, deliveries)
	}

	// A redelivered event is skipped even if provider state would now be rejected.
	f.provider.sub.Amount = 1200
	if err := f.db.SyncBilling(ctx, f.org, "sub_1", "evt_1", f.provider, true); err != nil {
		t.Fatalf("duplicate event: %v", err)
	}
}

func TestBillingMismatchIsRecordedAndClearedBySuccess(t *testing.T) {
	f := newBillingFixture(t)
	ctx := t.Context()
	f.provider.paid = true
	f.provider.sub.Amount = 1200

	err := f.db.SyncBilling(ctx, f.org, "sub_1", "evt_1", f.provider, true)
	if !errors.Is(err, billing.ErrMismatch) {
		t.Fatalf("got %v, want mismatch", err)
	}
	if err := f.db.RecordBillingSyncError(ctx, f.org, "sub_1", err.Error()); err != nil {
		t.Fatal(err)
	}
	record, _ := f.db.GetBilling(ctx, f.org)
	if !record.ActivationIssue || !record.CheckoutPending {
		t.Fatalf("issue should be visible and the checkout kept: %+v", record.State)
	}
	items, err := f.db.BillingReconcileCandidates(ctx, 10)
	if err != nil || len(items) != 1 || !items[0].SyncError || items[0].Subscription != "sub_1" {
		t.Fatalf("reconcile candidates %+v %v", items, err)
	}

	f.provider.sub.Amount = 900
	if err := f.db.SyncBilling(ctx, f.org, "sub_1", "evt_2", f.provider, true); err != nil {
		t.Fatal(err)
	}
	record, _ = f.db.GetBilling(ctx, f.org)
	if record.ActivationIssue || record.Plan != "starter" {
		t.Fatalf("issue should clear on success: %+v", record.State)
	}
}

func TestBillingRejectsSubscriptionFromAnotherOrganization(t *testing.T) {
	f := newBillingFixture(t)
	f.provider.paid = true
	f.provider.sub.Metadata["cascadehook_organization"] = uuid.NewString()
	if err := f.db.SyncBilling(t.Context(), f.org, "sub_1", "evt_1", f.provider, true); !errors.Is(err, billing.ErrMismatch) {
		t.Fatalf("got %v, want mismatch", err)
	}
	if plan, _ := f.entitlement(t); plan != "free" {
		t.Fatalf("foreign subscription granted %s", plan)
	}
}

func TestRefundRevokesAccessButKeepsPlanRecord(t *testing.T) {
	f := newBillingFixtureFor(t, "pdt_growth_m", 2900)
	ctx := t.Context()
	f.provider.paid = true
	if err := f.db.SyncBilling(ctx, f.org, "sub_1", "evt_1", f.provider, true); err != nil {
		t.Fatal(err)
	}
	if err := f.db.RevokeRefundedBilling(ctx, f.org, f.provider.sub, "growth"); err != nil {
		t.Fatal(err)
	}
	record, _ := f.db.GetBilling(ctx, f.org)
	if record.Status != "refunded" || record.Plan != "free" {
		t.Fatalf("refunded record: %+v", record.State)
	}
	var stored string
	if err := f.db.pool.QueryRow(ctx, `SELECT billing_plan FROM organizations WHERE id=$1`, f.org).Scan(&stored); err != nil || stored != "growth" {
		t.Fatalf("stored plan %q %v", stored, err)
	}
}

func TestReleaseExpiredCheckoutNeedsMatchingSession(t *testing.T) {
	f := newBillingFixture(t)
	ctx := t.Context()
	if err := f.db.ReleaseExpiredBillingCheckout(ctx, f.org, f.checkoutID, "cks_other"); err != nil {
		t.Fatal(err)
	}
	if record, _ := f.db.GetBilling(ctx, f.org); !record.CheckoutPending {
		t.Fatal("a different session must not release the reservation")
	}
	if err := f.db.ReleaseExpiredBillingCheckout(ctx, f.org, f.checkoutID, "cks_1"); err != nil {
		t.Fatal(err)
	}
	record, _ := f.db.GetBilling(ctx, f.org)
	if record.CheckoutPending || !record.CanCheckout {
		t.Fatalf("checkout should be released: %+v", record.State)
	}
	var audits int
	if err := f.db.pool.QueryRow(ctx, `SELECT count(*) FROM billing_recovery_actions WHERE organization_id=$1 AND operator_label='system-reconciler' AND provider_reference='cks_1'`, f.org).Scan(&audits); err != nil || audits != 1 {
		t.Fatalf("audit rows %d %v", audits, err)
	}
}
