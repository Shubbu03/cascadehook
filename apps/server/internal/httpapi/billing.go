package httpapi

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"cascadehook/internal/accounts"
	"cascadehook/internal/billing"
	"github.com/google/uuid"
)

func (api *api) billingPlans(w http.ResponseWriter, r *http.Request) {
	if !allowGetHead(w, r) || !accountQueryEmpty(w, r) {
		return
	}
	writeJSON(w, r, 200, map[string]any{"plans": billing.Plans(), "checkout_enabled": api.billing != nil})
}

func (api *api) billingOrganization(w http.ResponseWriter, r *http.Request, user accounts.User) (accounts.Organization, bool) {
	id, ok := readResourceID(w, r, "organization_id")
	if !ok {
		return accounts.Organization{}, false
	}
	org, err := api.db.GetOrganization(r.Context(), user.ID, id)
	if err != nil {
		api.accountProblem(w, r, err)
		return org, false
	}
	if !org.Role.CanManageProjects() {
		api.accountProblem(w, r, accounts.ErrForbidden)
		return org, false
	}
	return org, true
}

func (api *api) organizationBilling(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if !allowGetHead(w, r) || !accountQueryEmpty(w, r) {
		return
	}
	org, ok := api.billingOrganization(w, r, user)
	if !ok {
		return
	}
	record, err := api.db.GetBilling(r.Context(), org.ID)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	if api.billing != nil && record.HasSubscription {
		if err = api.db.SyncBilling(r.Context(), org.ID, "", "", api.billing, false); err != nil {
			api.logger.Warn("billing reconciliation unavailable", "organization_id", org.ID, "error", err)
			// Stored expiry still bounds entitlements during a provider outage.
		} else {
			record, err = api.db.GetBilling(r.Context(), org.ID)
			if err != nil {
				api.accountProblem(w, r, err)
				return
			}
		}
	}
	if record.CheckoutProduct != "" {
		if plan, interval, e := api.billingConfig.Offering(record.CheckoutProduct); e == nil {
			record.CheckoutPlan, record.CheckoutInterval = plan.ID, interval
		}
	}
	if record.ScheduledProduct != "" {
		if plan, interval, e := api.billingConfig.Offering(record.ScheduledProduct); e == nil {
			record.ScheduledPlan, record.ScheduledInterval = plan.ID, interval
		}
	}
	writeJSON(w, r, 200, map[string]any{"organization_id": org.ID, "billing": record.State, "can_manage": org.Role == accounts.Owner, "checkout_enabled": api.billing != nil, "plans": billing.Plans()})
}

func (api *api) billingCheckout(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeProblem(w, r, 405, "method_not_allowed")
		return
	}
	if !accountQueryEmpty(w, r) {
		return
	}
	org, ok := api.billingOrganization(w, r, user)
	if !ok {
		return
	}
	if org.Role != accounts.Owner {
		api.accountProblem(w, r, accounts.ErrForbidden)
		return
	}
	if api.billing == nil {
		writeProblem(w, r, 503, "billing_not_configured")
		return
	}
	var body struct {
		Plan     string `json:"plan"`
		Interval string `json:"interval"`
	}
	if err := readJSON(w, r, &body); err != nil {
		jsonProblem(w, r, err)
		return
	}
	product, err := api.billingConfig.Product(body.Plan, body.Interval)
	if err != nil {
		writeProblem(w, r, 422, "invalid_billing_plan")
		return
	}
	record, created, err := api.db.ReserveBillingCheckout(r.Context(), user.ID, org.ID, product)
	if err != nil {
		api.billingProblem(w, r, err)
		return
	}
	if !created {
		writeJSON(w, r, 200, map[string]string{"url": record.CheckoutURL})
		return
	}
	checkout, err := api.billing.Checkout(r.Context(), org.ID.String(), record.CheckoutID.String(), product, record.CustomerID)
	if err != nil {
		if billing.DefinitiveRejection(err) {
			if releaseErr := api.db.ReleaseRejectedBillingCheckout(r.Context(), org.ID, record.CheckoutID); releaseErr != nil {
				api.logger.Error("billing reservation release failed", "error", releaseErr)
			}
		}
		api.logger.Error("billing checkout unconfirmed", "organization_id", org.ID, "operation_id", record.CheckoutID, "error", err)
		writeProblem(w, r, 503, "billing_checkout_unconfirmed")
		return
	}
	if err = api.db.SaveBillingCheckout(r.Context(), org.ID, record.CheckoutID, checkout.ID, checkout.URL); err != nil {
		api.logger.Error("billing checkout persistence failed", "organization_id", org.ID, "operation_id", record.CheckoutID, "session_id", checkout.ID)
		api.billingProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, map[string]string{"url": checkout.URL})
}

func (api *api) billingPortal(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeProblem(w, r, 405, "method_not_allowed")
		return
	}
	if !accountQueryEmpty(w, r) {
		return
	}
	org, ok := api.billingOrganization(w, r, user)
	if !ok {
		return
	}
	if api.billing == nil {
		writeProblem(w, r, 503, "billing_not_configured")
		return
	}
	customer, err := api.db.BillingPortalCustomer(r.Context(), user.ID, org.ID)
	if err != nil {
		api.billingProblem(w, r, err)
		return
	}
	url, err := api.billing.Portal(r.Context(), customer)
	if err != nil {
		api.billingProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, map[string]string{"url": url})
}

func (api *api) dodoWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeProblem(w, r, 405, "method_not_allowed")
		return
	}
	if api.billing == nil {
		writeProblem(w, r, 503, "billing_not_configured")
		return
	}
	if !accountQueryEmpty(w, r) {
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 128<<10))
	if err != nil {
		writeProblem(w, r, 413, "payload_too_large")
		return
	}
	event, err := api.billingConfig.VerifyWebhook(body, r.Header, time.Now())
	if err != nil {
		writeProblem(w, r, 400, "invalid_billing_webhook")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	if event.Type == "refund.succeeded" || event.Type == "dispute.lost" {
		if err = api.applyBillingRefund(ctx, event); err != nil {
			api.billingProblem(w, r, err)
			return
		}
		w.WriteHeader(204)
		return
	}
	if !strings.HasPrefix(event.Type, "subscription.") {
		w.WriteHeader(204)
		return
	}
	org, found, err := api.db.BillingOrganization(ctx, event.Data.SubscriptionID)
	if err != nil {
		api.billingProblem(w, r, err)
		return
	}
	if !found {
		org, err = uuid.Parse(event.Data.Metadata["cascadehook_organization"])
		if err != nil {
			w.WriteHeader(204)
			return
		}
	}
	if err = api.db.SyncBilling(ctx, org, event.Data.SubscriptionID, event.ID, api.billing, true); err != nil {
		api.billingProblem(w, r, err)
		return
	}
	w.WriteHeader(204)
}

func (api *api) billingProblem(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, accounts.ErrForbidden) || errors.Is(err, accounts.ErrNotFound) {
		api.accountProblem(w, r, err)
		return
	}
	if errors.Is(err, billing.ErrConflict) {
		writeProblem(w, r, 409, "billing_conflict")
		return
	}
	api.logger.Error("billing operation unavailable", "error", err)
	writeProblem(w, r, 503, "billing_unavailable")
}

func (api *api) billingChangePlan(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeProblem(w, r, 405, "method_not_allowed")
		return
	}
	if !accountQueryEmpty(w, r) {
		return
	}
	org, ok := api.billingOrganization(w, r, user)
	if !ok {
		return
	}
	if api.billing == nil {
		writeProblem(w, r, 503, "billing_not_configured")
		return
	}
	var body struct {
		Plan     string `json:"plan"`
		Interval string `json:"interval"`
	}
	if err := readJSON(w, r, &body); err != nil {
		jsonProblem(w, r, err)
		return
	}
	product, err := api.billingConfig.Product(body.Plan, body.Interval)
	if err != nil {
		writeProblem(w, r, 422, "invalid_billing_plan")
		return
	}
	subscription, err := api.db.BillingChangeSubscription(r.Context(), user.ID, org.ID)
	if err != nil {
		api.billingProblem(w, r, err)
		return
	}
	if err = api.billing.ScheduleChange(r.Context(), subscription, product); err != nil {
		api.billingProblem(w, r, err)
		return
	}
	if err = api.db.SyncBilling(r.Context(), org.ID, subscription, "", api.billing, true); err != nil {
		api.billingProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, map[string]string{"status": "scheduled"})
}

func (api *api) applyBillingRefund(ctx context.Context, event billing.Event) error {
	paymentID := event.Data.PaymentID
	if event.Type == "refund.succeeded" {
		var err error
		paymentID, err = api.billing.RefundedPayment(ctx, event.Data.RefundID)
		if err != nil {
			return err
		}
	}
	payment, err := api.billing.Payment(ctx, paymentID)
	if err != nil {
		return err
	}
	if event.Type == "refund.succeeded" && payment.RefundStatus != "full" {
		return nil
	}
	if payment.Subscription == "" {
		return nil
	}
	org, found, err := api.db.BillingOrganization(ctx, payment.Subscription)
	if err != nil {
		return err
	}
	if !found {
		sub, err := api.billing.Subscription(ctx, payment.Subscription)
		if err != nil {
			return err
		}
		org, err = uuid.Parse(sub.Metadata["cascadehook_organization"])
		if err != nil {
			return nil
		}
	}
	// Retrieve the binding independently of the event body before revoking access.
	sub, err := api.billing.Subscription(ctx, payment.Subscription)
	if err != nil {
		return err
	}
	if sub.Metadata["cascadehook_organization"] != org.String() {
		return billing.ErrMismatch
	}
	if sub.Status != "cancelled" && sub.Status != "expired" && sub.Status != "failed" {
		if err = api.billing.CancelNow(ctx, payment.Subscription); err != nil {
			return err
		}
	}
	return api.db.RevokeRefundedBilling(ctx, org, sub)
}
