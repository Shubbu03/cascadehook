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
	"cascadehook/internal/store"
	"github.com/google/uuid"
)

func (api *api) billingPlans(w http.ResponseWriter, r *http.Request) {
	if !allowGetHead(w, r) || !accountQueryEmpty(w, r) {
		return
	}
	writeJSON(w, r, 200, map[string]any{"plans": billing.Plans(), "checkout_enabled": api.billing != nil, "founding": api.founding(r.Context())})
}

// localPrices is best effort: without them the page shows USD list prices, as on the pricing page.
func (api *api) localPrices(ctx context.Context, country string) map[string]billing.LocalPrice {
	if api.billing == nil || country == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	prices, err := api.billing.LocalPrices(ctx, country)
	if err != nil {
		api.logger.Warn("local prices unavailable", "country", country, "error", err)
		return nil
	}
	return prices
}

// founding is best effort: without it, pages show list prices and checkout charges list prices.
func (api *api) founding(ctx context.Context) *billing.FoundingOffer {
	if api.billing == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	carried, err := api.db.CountFoundingCarried(ctx)
	if err != nil {
		api.logger.Warn("founding carry count unavailable", "error", err)
		return nil
	}
	offer, err := api.billing.Founding(ctx, carried)
	if err != nil {
		api.logger.Warn("founding offer unavailable", "error", err)
		return nil
	}
	if !offer.Active {
		return nil
	}
	return &offer
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
			// Stored expiry still bounds entitlements during a provider outage.
			api.sync().note(r.Context(), org.ID, record.SubscriptionID, err)
		} else if record, err = api.db.GetBilling(r.Context(), org.ID); err != nil {
			api.accountProblem(w, r, err)
			return
		}
	}
	// Returning from checkout should not wait for a webhook or the background reconciler.
	if api.billing != nil && record.CheckoutPending && record.CheckoutSession != "" {
		if due, touchErr := api.db.TouchBillingSync(r.Context(), org.ID); touchErr == nil && due {
			api.sync().checkout(r.Context(), org.ID, record.CheckoutID, record.CheckoutSession)
			if record, err = api.db.GetBilling(r.Context(), org.ID); err != nil {
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
	writeJSON(w, r, 200, map[string]any{"organization_id": org.ID, "billing": record.State, "can_manage": org.Role == accounts.Owner,
		"checkout_enabled": api.billing != nil, "plans": billing.Plans(), "founding": api.founding(r.Context()),
		"local_prices": api.localPrices(r.Context(), record.Country)})
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
	code := ""
	if offer := api.founding(r.Context()); offer != nil {
		code = api.billingConfig.FoundingCode(body.Interval)
	}
	checkout, err := api.billing.Checkout(r.Context(), org.ID.String(), record.CheckoutID.String(), product, record.CustomerID, code)
	if code != "" && billing.DefinitiveRejection(err) {
		// The last founding spot can go between the offer check and checkout; fall back to list price.
		api.logger.Info("founding code rejected at checkout; retrying at list price", "organization_id", org.ID)
		checkout, err = api.billing.Checkout(r.Context(), org.ID.String(), record.CheckoutID.String(), product, record.CustomerID, "")
	}
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
	url, err := api.billing.Portal(r.Context(), customer, org.ID.String())
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
		// A failure response keeps the delivery visible as failed in the Dodo dashboard,
		// and Dodo retries it; the reconciler also retries recorded mismatches.
		api.sync().note(ctx, org, event.Data.SubscriptionID, err)
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
	var provider *billing.ProviderError
	// Dodo rejects a change while another is pending or the subscription is past due or on hold.
	if errors.Is(err, billing.ErrConflict) || (errors.As(err, &provider) && (provider.Status == 409 || provider.Status == 422)) {
		writeProblem(w, r, 409, "billing_conflict")
		return
	}
	if !errors.Is(err, billing.ErrPaymentPending) && !errors.Is(err, billing.ErrMismatch) {
		api.logger.Error("billing operation unavailable", "error", err)
	}
	writeProblem(w, r, 503, "billing_unavailable")
}

type billingChange struct {
	org          accounts.Organization
	record       store.BillingRecord
	change       billing.PlanChange
	interval     string
	plan         string
	subscription string
}

// readBillingChange checks the owner, the requested offering, and that the subscription can change.
func (api *api) readBillingChange(w http.ResponseWriter, r *http.Request, user accounts.User) (billingChange, bool) {
	var change billingChange
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeProblem(w, r, 405, "method_not_allowed")
		return change, false
	}
	if !accountQueryEmpty(w, r) {
		return change, false
	}
	org, ok := api.billingOrganization(w, r, user)
	if !ok {
		return change, false
	}
	if org.Role != accounts.Owner {
		api.accountProblem(w, r, accounts.ErrForbidden)
		return change, false
	}
	if api.billing == nil {
		writeProblem(w, r, 503, "billing_not_configured")
		return change, false
	}
	var body struct {
		Plan     string `json:"plan"`
		Interval string `json:"interval"`
	}
	if err := readJSON(w, r, &body); err != nil {
		jsonProblem(w, r, err)
		return change, false
	}
	product, err := api.billingConfig.Product(body.Plan, body.Interval)
	if err != nil {
		writeProblem(w, r, 422, "invalid_billing_plan")
		return change, false
	}
	record, err := api.db.GetBilling(r.Context(), org.ID)
	if err != nil {
		api.billingProblem(w, r, err)
		return change, false
	}
	if record.SubscriptionID == "" || record.Status != "active" || record.CancelAtPeriodEnd {
		writeProblem(w, r, 409, "billing_conflict")
		return change, false
	}
	// Founding customers keep their discount on every plan, including after switching interval.
	sub, err := api.billing.Subscription(r.Context(), record.SubscriptionID)
	if err != nil {
		api.billingProblem(w, r, err)
		return change, false
	}
	change = billingChange{org: org, record: record, plan: body.Plan, interval: body.Interval, subscription: record.SubscriptionID,
		change: billing.PlanChange{Product: product, Immediate: billing.Upgrade(record.Plan, record.Interval, body.Plan, body.Interval),
			DiscountCode: api.billingConfig.FoundingCarry(sub, record.Interval, body.Interval)}}
	return change, true
}

func (api *api) billingChangePreview(w http.ResponseWriter, r *http.Request, user accounts.User) {
	change, ok := api.readBillingChange(w, r, user)
	if !ok {
		return
	}
	preview, err := api.billing.PreviewChange(r.Context(), change.subscription, change.change)
	if err != nil {
		api.billingProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, map[string]any{"immediate": change.change.Immediate, "founding": preview.DiscountApplied, "total": preview.Total, "tax": preview.Tax,
		"currency": preview.Currency, "effective_at": preview.EffectiveAt})
}

func (api *api) billingChangePlan(w http.ResponseWriter, r *http.Request, user accounts.User) {
	change, ok := api.readBillingChange(w, r, user)
	if !ok {
		return
	}
	subscription, err := api.db.BillingChangeSubscription(r.Context(), user.ID, change.org.ID)
	if err != nil {
		api.billingProblem(w, r, err)
		return
	}
	result, err := api.billing.ChangePlan(r.Context(), subscription, change.change, change.org.ID.String())
	if err != nil {
		api.billingProblem(w, r, err)
		return
	}
	if result.DiscountApplied {
		if err = api.db.MarkFoundingCarried(r.Context(), change.org.ID); err != nil {
			api.logger.Warn("founding carry not recorded", "organization_id", change.org.ID, "error", err)
		}
	}
	if err = api.db.SyncBilling(r.Context(), change.org.ID, subscription, "", api.billing, true); err != nil {
		api.sync().note(r.Context(), change.org.ID, subscription, err)
	}
	// Dodo switches the plan only after the charge succeeds; the owner pays on its checkout page
	// when a link is returned, and a webhook then updates the limits.
	status := "scheduled"
	switch {
	case !change.change.Immediate:
	case result.PaymentLink != "":
		status = "redirect"
	case result.PaymentID != "":
		status = "pending_payment"
	default:
		status = "applied"
	}
	writeJSON(w, r, 200, map[string]string{"status": status, "url": result.PaymentLink, "payment_id": result.PaymentID})
}

// billingResume keeps a subscription that is set to cancel at the end of its paid period.
func (api *api) billingResume(w http.ResponseWriter, r *http.Request, user accounts.User) {
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
	record, err := api.db.GetBilling(r.Context(), org.ID)
	if err != nil {
		api.billingProblem(w, r, err)
		return
	}
	if record.SubscriptionID == "" || !record.CancelAtPeriodEnd || record.Status != "active" {
		writeProblem(w, r, 409, "billing_conflict")
		return
	}
	if err = api.billing.Resume(r.Context(), record.SubscriptionID); err != nil {
		api.billingProblem(w, r, err)
		return
	}
	if err = api.db.SyncBilling(r.Context(), org.ID, record.SubscriptionID, "", api.billing, true); err != nil {
		api.sync().note(r.Context(), org.ID, record.SubscriptionID, err)
	}
	w.WriteHeader(204)
}

// billingPayment reports a plan-change payment after an upgrade, so a declined charge is shown
// instead of a plan that silently never changes. Only this organization's payments are visible.
func (api *api) billingPayment(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if !allowGetHead(w, r) || !accountQueryEmpty(w, r) {
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
	id := r.PathValue("payment_id")
	if !billing.SafePaymentID(id) {
		writeProblem(w, r, 400, "invalid_payment_id")
		return
	}
	record, err := api.db.GetBilling(r.Context(), org.ID)
	if err != nil {
		api.billingProblem(w, r, err)
		return
	}
	payment, err := api.billing.Payment(r.Context(), id)
	if err != nil {
		api.billingProblem(w, r, err)
		return
	}
	if record.SubscriptionID == "" || payment.Subscription != record.SubscriptionID {
		api.accountProblem(w, r, accounts.ErrNotFound)
		return
	}
	if payment.Status == "succeeded" {
		if err = api.db.SyncBilling(r.Context(), org.ID, record.SubscriptionID, "", api.billing, true); err != nil {
			api.sync().note(r.Context(), org.ID, record.SubscriptionID, err)
		}
	}
	writeJSON(w, r, 200, map[string]string{"status": payment.Status})
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
	plan := ""
	if offering, _, offeringErr := api.billingConfig.Offering(sub.Product); offeringErr == nil {
		plan = offering.ID
	}
	return api.db.RevokeRefundedBilling(ctx, org, sub, plan)
}
