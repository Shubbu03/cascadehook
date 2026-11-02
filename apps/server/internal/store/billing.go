package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"cascadehook/internal/accounts"
	"cascadehook/internal/billing"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type BillingProvider interface {
	Subscription(context.Context, string) (billing.Subscription, error)
	ValidateSubscription(billing.Subscription) (billing.Plan, string, error)
	ConfirmPaidPeriod(context.Context, billing.Subscription) (bool, error)
}

type BillingRecord struct {
	billing.State
	CustomerID       string
	SubscriptionID   string
	CheckoutID       uuid.UUID
	CheckoutProduct  string
	CheckoutURL      string
	CheckoutSession  string
	ScheduledProduct string
	SyncedAt         *time.Time
}

func readBilling(ctx context.Context, tx pgx.Tx, org uuid.UUID) (BillingRecord, error) {
	var result BillingRecord
	err := tx.QueryRow(ctx, `SELECT e.plan,e.retention_days,coalesce(b.billing_interval,''),coalesce(b.status,'free'),
 b.paid_through,o.billing_access_until,coalesce(b.cancel_at_period_end,false),coalesce(b.customer_id,''),
 coalesce(b.subscription_id,''),coalesce(b.checkout_id,'00000000-0000-0000-0000-000000000000'::uuid),
 coalesce(b.checkout_product_id,''),coalesce(b.checkout_url,''),b.synced_at,coalesce(b.checkout_session_id,''),coalesce(b.scheduled_product,''),b.scheduled_at
 FROM organizations o JOIN organization_entitlements e ON e.id=o.id
 LEFT JOIN organization_billing b ON b.organization_id=o.id WHERE o.id=$1 AND o.deletion_requested_at IS NULL`, org).Scan(
		&result.Plan, &result.RetentionDays, &result.Interval, &result.Status, &result.PaidThrough, &result.AccessUntil, &result.CancelAtPeriodEnd,
		&result.CustomerID, &result.SubscriptionID, &result.CheckoutID, &result.CheckoutProduct, &result.CheckoutURL, &result.SyncedAt, &result.CheckoutSession, &result.ScheduledProduct, &result.ScheduledAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return result, accounts.ErrNotFound
	}
	if err != nil {
		return result, fmt.Errorf("read organization billing: %w", err)
	}
	result.HasSubscription = result.SubscriptionID != ""
	result.CheckoutPending = result.CheckoutID != uuid.Nil
	terminal := !result.HasSubscription || result.Status == "cancelled" || result.Status == "expired" || result.Status == "failed" || result.Status == "refunded"
	result.CanCheckout = terminal && (result.AccessUntil == nil || !result.AccessUntil.After(time.Now()))
	return result, nil
}

func (s *Store) GetBilling(ctx context.Context, org uuid.UUID) (BillingRecord, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return BillingRecord{}, err
	}
	defer rollbackTransaction(tx)
	return readBilling(ctx, tx, org)
}

// Reserve before contacting Dodo: ambiguous network outcomes cannot cause a second purchase.
func (s *Store) ReserveBillingCheckout(ctx context.Context, user, org uuid.UUID, product string) (BillingRecord, bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return BillingRecord{}, false, err
	}
	defer rollbackTransaction(tx)
	role, err := lockOrganizationAccess(ctx, tx, user, org)
	if err != nil {
		return BillingRecord{}, false, err
	}
	if role != accounts.Owner {
		return BillingRecord{}, false, accounts.ErrForbidden
	}
	if _, err = tx.Exec(ctx, `INSERT INTO organization_billing(organization_id) VALUES($1) ON CONFLICT DO NOTHING`, org); err != nil {
		return BillingRecord{}, false, err
	}
	record, err := readBilling(ctx, tx, org)
	if err != nil {
		return record, false, err
	}
	if record.CheckoutID != uuid.Nil {
		if record.CheckoutProduct != product || record.CheckoutURL == "" {
			return record, false, billing.ErrConflict
		}
		return record, false, nil
	}
	if record.SubscriptionID != "" && record.Status != "cancelled" && record.Status != "expired" && record.Status != "failed" && record.Status != "refunded" {
		return record, false, billing.ErrConflict
	}
	if record.AccessUntil != nil && record.AccessUntil.After(time.Now()) {
		return record, false, billing.ErrConflict
	}
	record.CheckoutID, err = uuid.NewV7()
	if err != nil {
		return record, false, err
	}
	record.CheckoutProduct = product
	_, err = tx.Exec(ctx, `UPDATE organization_billing SET checkout_id=$2,checkout_product_id=$3,checkout_url=NULL,updated_at=clock_timestamp() WHERE organization_id=$1`, org, record.CheckoutID, product)
	if err != nil {
		return record, false, err
	}
	if err = tx.Commit(ctx); err != nil {
		return record, false, err
	}
	return record, true, nil
}

func (s *Store) SaveBillingCheckout(ctx context.Context, org, operation uuid.UUID, session, url string) error {
	result, err := s.pool.Exec(ctx, `UPDATE organization_billing SET checkout_url=$3,checkout_session_id=$4 WHERE organization_id=$1 AND checkout_id=$2`, org, operation, url, session)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return billing.ErrConflict
	}
	return nil
}

func (s *Store) BillingPortalCustomer(ctx context.Context, user, org uuid.UUID) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer rollbackTransaction(tx)
	role, err := lockOrganizationAccess(ctx, tx, user, org)
	if err != nil {
		return "", err
	}
	if role != accounts.Owner {
		return "", accounts.ErrForbidden
	}
	var customer string
	err = tx.QueryRow(ctx, `UPDATE organization_billing SET action_at=clock_timestamp() WHERE organization_id=$1
 AND customer_id IS NOT NULL AND action_at < clock_timestamp()-interval '5 seconds' RETURNING customer_id`, org).Scan(&customer)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", billing.ErrConflict
	}
	if err != nil {
		return "", err
	}
	return customer, tx.Commit(ctx)
}

// SyncBilling fetches authoritative provider state while serializing this tenant's transitions.
// No event payload can choose a price, customer, tenant, or reset the usage counters.
func (s *Store) SyncBilling(ctx context.Context, org uuid.UUID, subscriptionID, eventID string, provider BillingProvider, force bool) error {
	if !force {
		result, err := s.pool.Exec(ctx, `UPDATE organization_billing SET sync_attempt_at=clock_timestamp() WHERE organization_id=$1
            AND (sync_attempt_at IS NULL OR sync_attempt_at < clock_timestamp()-interval '1 minute')`, org)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return nil
		}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer rollbackTransaction(tx)
	var id uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM organizations WHERE id=$1 AND deletion_requested_at IS NULL FOR UPDATE`, org).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if eventID != "" {
		var found bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM billing_webhook_receipts WHERE id=$1)`, eventID).Scan(&found); err != nil {
			return err
		}
		if found {
			return nil
		}
	}
	record, err := readBilling(ctx, tx, org)
	if err != nil {
		return err
	}
	if !force && record.SyncedAt != nil && time.Since(*record.SyncedAt) < time.Minute {
		return nil
	}
	if subscriptionID == "" {
		subscriptionID = record.SubscriptionID
	}
	if subscriptionID == "" {
		return nil
	}
	sub, err := provider.Subscription(ctx, subscriptionID)
	if err != nil {
		return err
	}
	plan, interval, err := provider.ValidateSubscription(sub)
	if err != nil {
		return err
	}
	if sub.Metadata["cascadehook_organization"] != org.String() {
		return billing.ErrMismatch
	}
	binding := record.SubscriptionID != sub.ID
	if binding {
		var historical bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM billing_subscriptions WHERE subscription_id=$1 AND organization_id=$2)`, sub.ID, org).Scan(&historical); err != nil {
			return err
		}
		if historical {
			return nil
		}
	}
	if record.Status == "refunded" && !binding {
		return nil
	}
	if binding {
		operation, parseErr := uuid.Parse(sub.Metadata["cascadehook_checkout"])
		terminal := record.SubscriptionID == "" || record.Status == "expired" || record.Status == "cancelled" || record.Status == "failed" || record.Status == "refunded"
		if parseErr != nil || record.CheckoutID == uuid.Nil || operation != record.CheckoutID || sub.Product != record.CheckoutProduct || !terminal {
			return billing.ErrMismatch
		}
	}
	if record.CustomerID != "" && record.CustomerID != sub.Customer.ID {
		return billing.ErrMismatch
	}
	if binding && sub.Status != "active" && sub.Status != "cancelled" {
		return nil
	}
	if binding {
		paid, err := provider.ConfirmPaidPeriod(ctx, sub)
		if err != nil {
			return err
		}
		if !paid {
			return billing.ErrMismatch
		}
	}
	paid := record.PaidThrough
	if binding {
		if _, err = tx.Exec(ctx, `INSERT INTO billing_subscriptions(subscription_id,organization_id) VALUES($1,$2)`, sub.ID, org); err != nil {
			return err
		}
		paid = nil
	}
	if sub.Status == "active" || (sub.Status == "cancelled" && paid == nil && !sub.PreviousBilling.IsZero()) {
		at := sub.NextBilling
		if at.After(time.Now().AddDate(2, 0, 0)) || sub.PreviousBilling.After(time.Now().Add(5*time.Minute)) {
			return billing.ErrMismatch
		}
		paid = &at
	}
	var access *time.Time
	if paid != nil {
		at := *paid
		if !sub.CancelAtEnd && (sub.Status == "active" || sub.Status == "on_hold" || sub.Status == "past_due") {
			at = at.Add(72 * time.Hour)
		}
		access = &at
	}
	effective := plan
	if access == nil || !access.After(time.Now()) {
		effective, _ = billing.FindPlan("free")
	}
	limits := effective.Limits
	_, err = tx.Exec(ctx, `UPDATE organizations SET billing_plan=$2,billing_access_until=$3,history_retention_days=$4,
 max_projects=$5,max_members=$6,max_endpoints_per_project=$7,max_keys_per_project=$8,
 max_monthly_events=$9,max_monthly_deliveries=$10,max_payload_bytes_per_project=$11,
 quota_version=quota_version+CASE WHEN ROW(max_projects,max_members,max_endpoints_per_project,max_keys_per_project,max_monthly_events,max_monthly_deliveries,max_payload_bytes_per_project)
 IS DISTINCT FROM ROW($5::integer,$6::integer,$7::integer,$8::integer,$9::bigint,$10::bigint,$11::bigint) THEN 1 ELSE 0 END,updated_at=clock_timestamp() WHERE id=$1`, org, plan.ID, access, plan.RetentionDays,
		limits.Projects, limits.Members, limits.Endpoints, limits.APIKeys, limits.MonthlyEvents, limits.MonthlyJobs, limits.StoredBytes)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO organization_billing(organization_id,customer_id,subscription_id,status,billing_interval,paid_through,cancel_at_period_end,synced_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()) ON CONFLICT(organization_id) DO UPDATE SET
 customer_id=EXCLUDED.customer_id,subscription_id=EXCLUDED.subscription_id,status=EXCLUDED.status,
 billing_interval=EXCLUDED.billing_interval,paid_through=EXCLUDED.paid_through,cancel_at_period_end=EXCLUDED.cancel_at_period_end,
 synced_at=clock_timestamp(),updated_at=clock_timestamp()`,
		org, sub.Customer.ID, sub.ID, sub.Status, interval, paid, sub.CancelAtEnd)
	if err != nil {
		return err
	}
	if binding {
		if _, err = tx.Exec(ctx, `UPDATE organization_billing SET checkout_id=NULL,checkout_product_id=NULL,checkout_url=NULL,checkout_session_id=NULL WHERE organization_id=$1 AND checkout_id=$2`, org, record.CheckoutID); err != nil {
			return err
		}
	}
	var scheduledProduct any
	var scheduledAt any
	if sub.ScheduledChange != nil {
		scheduledProduct = sub.ScheduledChange.Product
		scheduledAt = sub.ScheduledChange.EffectiveAt
	}
	if _, err = tx.Exec(ctx, `UPDATE organization_billing SET scheduled_product=$2,scheduled_at=$3 WHERE organization_id=$1`, org, scheduledProduct, scheduledAt); err != nil {
		return err
	}
	if eventID != "" {
		if _, err = tx.Exec(ctx, `INSERT INTO billing_webhook_receipts(id) VALUES($1) ON CONFLICT DO NOTHING`, eventID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) ReleaseRejectedBillingCheckout(ctx context.Context, org, operation uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `UPDATE organization_billing SET checkout_id=NULL,checkout_product_id=NULL,checkout_url=NULL,checkout_session_id=NULL
 WHERE organization_id=$1 AND checkout_id=$2 AND checkout_url IS NULL`, org, operation)
	return err
}

func (s *Store) BillingOrganization(ctx context.Context, subscription string) (uuid.UUID, bool, error) {
	var org uuid.UUID
	err := s.pool.QueryRow(ctx, `SELECT organization_id FROM billing_subscriptions WHERE subscription_id=$1`, subscription).Scan(&org)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	return org, err == nil, err
}

func (s *Store) BillingChangeSubscription(ctx context.Context, user, org uuid.UUID) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer rollbackTransaction(tx)
	role, err := lockOrganizationAccess(ctx, tx, user, org)
	if err != nil {
		return "", err
	}
	if role != accounts.Owner {
		return "", accounts.ErrForbidden
	}
	var subscription string
	err = tx.QueryRow(ctx, `UPDATE organization_billing SET action_at=clock_timestamp() WHERE organization_id=$1 AND status='active'
 AND subscription_id IS NOT NULL AND NOT cancel_at_period_end AND action_at<clock_timestamp()-interval '10 seconds' RETURNING subscription_id`, org).Scan(&subscription)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", billing.ErrConflict
	}
	if err != nil {
		return "", err
	}
	return subscription, tx.Commit(ctx)
}

// RevokeRefundedBilling can settle a refunded checkout before activation arrives.
func (s *Store) RevokeRefundedBilling(ctx context.Context, org uuid.UUID, sub billing.Subscription) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer rollbackTransaction(tx)
	var id uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM organizations WHERE id=$1 AND deletion_requested_at IS NULL FOR UPDATE`, org).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	record, err := readBilling(ctx, tx, org)
	if err != nil {
		return err
	}
	if record.SubscriptionID == sub.ID && record.Status == "refunded" {
		return nil
	}
	binding := record.SubscriptionID != sub.ID
	if record.SubscriptionID != sub.ID {
		var historical bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM billing_subscriptions WHERE subscription_id=$1)`, sub.ID).Scan(&historical); err != nil {
			return err
		}
		if historical {
			return nil
		}
		operation, parseErr := uuid.Parse(sub.Metadata["cascadehook_checkout"])
		if parseErr != nil || operation == uuid.Nil || operation != record.CheckoutID || sub.Product != record.CheckoutProduct || (record.CustomerID != "" && record.CustomerID != sub.Customer.ID) {
			return billing.ErrMismatch
		}
	}
	if sub.Metadata["cascadehook_organization"] != org.String() {
		return billing.ErrMismatch
	}
	_, err = tx.Exec(ctx, `INSERT INTO billing_subscriptions(subscription_id,organization_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, sub.ID, org)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE organization_billing SET subscription_id=$2,customer_id=$3,status='refunded',cancel_at_period_end=true,
 checkout_id=CASE WHEN $4 THEN NULL ELSE checkout_id END,checkout_product_id=CASE WHEN $4 THEN NULL ELSE checkout_product_id END,
 checkout_url=CASE WHEN $4 THEN NULL ELSE checkout_url END,checkout_session_id=CASE WHEN $4 THEN NULL ELSE checkout_session_id END,
 scheduled_product=NULL,scheduled_at=NULL,updated_at=clock_timestamp() WHERE organization_id=$1`, org, sub.ID, sub.Customer.ID, binding)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE organizations SET billing_plan='starter',billing_access_until=clock_timestamp(),quota_version=quota_version+1 WHERE id=$1`, org)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
