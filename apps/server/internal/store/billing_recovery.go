package store

import (
	"context"
	"fmt"

	"cascadehook/internal/billing"
	"github.com/google/uuid"
)

type BillingRecoveryStatus struct {
	OrganizationID uuid.UUID `json:"organization_id"`
	billing.State
	SubscriptionID  string    `json:"subscription_id"`
	CheckoutID      uuid.UUID `json:"checkout_id"`
	CheckoutSession string    `json:"checkout_session"`
}

func (s *Store) OperatorBillingStatus(ctx context.Context, org uuid.UUID) (BillingRecoveryStatus, error) {
	record, err := s.GetBilling(ctx, org)
	return BillingRecoveryStatus{OrganizationID: org, State: record.State, SubscriptionID: record.SubscriptionID, CheckoutID: record.CheckoutID, CheckoutSession: record.CheckoutSession}, err
}

// Operator access and external evidence are required: local timeout does not expire a Dodo checkout.
func (s *Store) ClearBillingCheckout(ctx context.Context, org, expected uuid.UUID, operator, reference string) error {
	if !operatorLabelPattern.MatchString(operator) || len(reference) < 1 || len(reference) > 200 || expected == uuid.Nil {
		return fmt.Errorf("valid operator, provider reference and expected checkout UUID are required")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer rollbackTransaction(tx)
	var id uuid.UUID
	if err = tx.QueryRow(ctx, `SELECT id FROM organizations WHERE id=$1 FOR UPDATE`, org).Scan(&id); err != nil {
		return err
	}
	record, err := readBilling(ctx, tx, org)
	if err != nil {
		return err
	}
	if record.CheckoutID != expected || !record.CanCheckout {
		return billing.ErrConflict
	}
	action, err := uuid.NewV7()
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO billing_recovery_actions(id,organization_id,checkout_id,operator_label,provider_reference) VALUES($1,$2,$3,$4,$5)`, action, org, expected, operator, reference)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE organization_billing SET checkout_id=NULL,checkout_product_id=NULL,checkout_url=NULL,checkout_session_id=NULL,updated_at=clock_timestamp() WHERE organization_id=$1`, org)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
