package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"cascadehook/internal/billing"
	"cascadehook/internal/store"
	"github.com/google/uuid"
)

// Dodo checkout sessions expire after 24 hours. The extra hour lets a payment that
// finished at the deadline appear before a reservation is released.
const checkoutExpiry = 25 * time.Hour

const reconcileInterval = 10 * time.Minute

type billingSync struct {
	db       *store.Store
	provider *billing.Provider
	logger   *slog.Logger
}

func (api *api) sync() *billingSync {
	return &billingSync{db: api.db, provider: api.billing, logger: api.logger}
}

// note records a permanent mismatch so the owner sees it and the reconciler retries it
// after the Dodo configuration is fixed. Temporary failures are left for retries.
func (b *billingSync) note(ctx context.Context, org uuid.UUID, subscription string, err error) {
	if err == nil {
		return
	}
	if !errors.Is(err, billing.ErrMismatch) {
		if !errors.Is(err, billing.ErrPaymentPending) {
			b.logger.Warn("billing sync unavailable", "organization_id", org, "subscription_id", subscription, "error", err)
		}
		return
	}
	b.logger.Error("billing activation needs attention", "organization_id", org, "subscription_id", subscription, "reason", err.Error())
	if recordErr := b.db.RecordBillingSyncError(context.WithoutCancel(ctx), org, subscription, err.Error()); recordErr != nil {
		b.logger.Error("billing sync error not recorded", "organization_id", org, "error", recordErr)
	}
}

// checkout finishes a checkout whose webhook never arrived, or releases it once Dodo
// reports the session expired without a successful payment.
func (b *billingSync) checkout(ctx context.Context, org, operation uuid.UUID, session string) {
	if session == "" || operation == uuid.Nil {
		return
	}
	state, err := b.provider.CheckoutSession(ctx, session)
	if err != nil {
		b.logger.Warn("billing checkout lookup unavailable", "organization_id", org, "session_id", session, "error", err)
		return
	}
	if state.PaymentID != "" {
		payment, err := b.provider.Payment(ctx, state.PaymentID)
		if err != nil {
			b.logger.Warn("billing payment lookup unavailable", "organization_id", org, "error", err)
			return
		}
		if payment.Status == "succeeded" && payment.Subscription != "" {
			b.note(ctx, org, payment.Subscription, b.db.SyncBilling(ctx, org, payment.Subscription, "", b.provider, true))
			return
		}
		if payment.Status != "failed" && payment.Status != "cancelled" {
			return
		}
	}
	if state.CreatedAt.IsZero() || time.Since(state.CreatedAt) < checkoutExpiry {
		return
	}
	if err := b.db.ReleaseExpiredBillingCheckout(ctx, org, operation, session); err != nil {
		b.logger.Warn("billing checkout release failed", "organization_id", org, "error", err)
		return
	}
	b.logger.Info("released expired billing checkout", "organization_id", org, "session_id", session)
}

func (b *billingSync) reconcile(ctx context.Context) {
	items, err := b.db.BillingReconcileCandidates(ctx, 50)
	if err != nil {
		b.logger.Warn("billing reconcile candidates unavailable", "error", err)
		return
	}
	for _, item := range items {
		if ctx.Err() != nil {
			return
		}
		if item.CheckoutID != uuid.Nil && item.CheckoutSession != "" {
			b.checkout(ctx, item.Organization, item.CheckoutID, item.CheckoutSession)
		}
		if item.Subscription != "" {
			b.note(ctx, item.Organization, item.Subscription, b.db.SyncBilling(ctx, item.Organization, item.Subscription, "", b.provider, item.SyncError))
		}
	}
}

// run catches up anything webhooks missed: rejected activations, abandoned or
// unreported checkouts, and subscriptions that have not been synced recently.
func (b *billingSync) run(ctx context.Context) {
	timer := time.NewTimer(time.Minute)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
		b.reconcile(ctx)
		timer.Reset(reconcileInterval)
	}
}
