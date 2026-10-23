package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/deliveries"
)

const deliveryReadColumns = `d.id, d.project_id, d.event_id, d.endpoint_id, d.state, d.attempt_count, d.cycle,
	d.cycle_started_at, d.retry_deadline,
	CASE WHEN d.state = 'pending' THEN d.next_attempt_at END, d.terminal_reason,
	d.active_attempt_id, d.active_attempt_started_at, d.lease_expires_at, d.created_at, d.updated_at`

func scanDelivery(row pgx.Row, delivery *deliveries.Delivery) error {
	return row.Scan(&delivery.ID, &delivery.ProjectID, &delivery.EventID, &delivery.EndpointID, &delivery.State,
		&delivery.AttemptCount, &delivery.Cycle, &delivery.CycleStartedAt, &delivery.RetryDeadline, &delivery.NextAttemptAt, &delivery.TerminalReason,
		&delivery.ActiveAttemptID, &delivery.ActiveAttemptStartedAt, &delivery.LeaseExpiresAt, &delivery.CreatedAt, &delivery.UpdatedAt)
}

func (s *Store) GetDelivery(ctx context.Context, projectID, id uuid.UUID) (deliveries.Delivery, error) {
	var delivery deliveries.Delivery
	err := scanDelivery(s.pool.QueryRow(ctx, `SELECT `+deliveryReadColumns+`
		FROM deliveries d JOIN events v ON v.project_id = d.project_id AND v.id = d.event_id
		WHERE d.project_id = $1 AND d.id = $2 AND v.purge_started_at IS NULL
		AND EXISTS (SELECT 1 FROM projects p WHERE p.id = d.project_id AND p.deletion_requested_at IS NULL
		AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = p.organization_id AND o.deletion_requested_at IS NULL))`, projectID, id), &delivery)
	if errors.Is(err, pgx.ErrNoRows) {
		return deliveries.Delivery{}, deliveries.ErrNotFound
	}
	if err != nil {
		return deliveries.Delivery{}, fmt.Errorf("get delivery: %w", err)
	}
	return delivery, nil
}

func (s *Store) ListDeliveries(ctx context.Context, projectID uuid.UUID, options deliveries.ListOptions) ([]deliveries.Delivery, error) {
	if err := options.Options.Validate(); err != nil {
		return nil, err
	}
	if options.State != "" && !deliveries.ValidState(options.State) {
		return nil, fmt.Errorf("invalid delivery state")
	}
	if (options.EventID != nil && *options.EventID == uuid.Nil) || (options.EndpointID != nil && *options.EndpointID == uuid.Nil) {
		return nil, fmt.Errorf("invalid delivery filter ID")
	}
	query := `SELECT ` + deliveryReadColumns + ` FROM deliveries d
		JOIN events v ON v.project_id = d.project_id AND v.id = d.event_id
		WHERE d.project_id = $1 AND v.purge_started_at IS NULL
		AND EXISTS (SELECT 1 FROM projects p WHERE p.id = d.project_id AND p.deletion_requested_at IS NULL
		AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = p.organization_id AND o.deletion_requested_at IS NULL))`
	args := []any{projectID}
	// Only fixed column names are assembled; every request value is bound.
	if options.EventID != nil {
		args = append(args, *options.EventID)
		query += fmt.Sprintf(` AND d.event_id = $%d`, len(args))
	}
	if options.EndpointID != nil {
		args = append(args, *options.EndpointID)
		query += fmt.Sprintf(` AND d.endpoint_id = $%d`, len(args))
	}
	if options.State != "" {
		args = append(args, options.State)
		query += fmt.Sprintf(` AND d.state = $%d`, len(args))
	}
	if options.Before != nil {
		args = append(args, options.Before.CreatedAt, options.Before.ID)
		query += fmt.Sprintf(` AND (d.created_at, d.id) < ($%d, $%d)`, len(args)-1, len(args))
	}
	args = append(args, options.Limit+1)
	query += fmt.Sprintf(` ORDER BY d.created_at DESC, d.id DESC LIMIT $%d`, len(args))
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list deliveries: %w", err)
	}
	result, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (deliveries.Delivery, error) {
		var delivery deliveries.Delivery
		err := scanDelivery(row, &delivery)
		return delivery, err
	})
	if err != nil {
		return nil, fmt.Errorf("read deliveries: %w", err)
	}
	return result, nil
}

func (s *Store) ListDeliveryAttempts(ctx context.Context, projectID, deliveryID uuid.UUID, options deliveries.AttemptListOptions) ([]deliveries.AttemptRecord, error) {
	if err := options.Validate(deliveryID); err != nil {
		return nil, err
	}
	// Keep the parent existence check and empty-history result on one snapshot.
	// This distinguishes an existing unsent delivery from a missing/foreign ID.
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, fmt.Errorf("begin attempt history read: %w", err)
	}
	defer rollbackTransaction(tx)
	var id uuid.UUID
	err = tx.QueryRow(
		ctx,
		`SELECT d.id FROM deliveries d JOIN events v ON v.project_id = d.project_id AND v.id = d.event_id
		WHERE d.project_id = $1 AND d.id = $2 AND v.purge_started_at IS NULL
		AND EXISTS (SELECT 1 FROM projects p WHERE p.id = d.project_id AND p.deletion_requested_at IS NULL
		AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = p.organization_id AND o.deletion_requested_at IS NULL))`,
		projectID,
		deliveryID,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, deliveries.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find delivery for history: %w", err)
	}
	query := `SELECT a.id, a.project_id, a.delivery_id, a.cycle, a.attempt_number,
		a.started_at, a.finished_at, a.duration_ms, a.status_code, a.outcome, a.error_code,
		a.response_truncated, a.response_read_error, a.delivery_state, a.terminal_reason, a.retry_at
		FROM delivery_attempts a WHERE a.project_id = $1 AND a.delivery_id = $2`
	args := []any{projectID, deliveryID}
	if options.Cycle != nil {
		args = append(args, *options.Cycle)
		query += fmt.Sprintf(` AND a.cycle = $%d`, len(args))
	}
	if options.Before != nil {
		args = append(args, options.Before.Cycle, options.Before.AttemptNumber)
		query += fmt.Sprintf(` AND (a.cycle, a.attempt_number) < ($%d, $%d)`, len(args)-1, len(args))
	}
	args = append(args, options.Limit+1)
	query += fmt.Sprintf(` ORDER BY a.cycle DESC, a.attempt_number DESC LIMIT $%d`, len(args))
	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list delivery attempts: %w", err)
	}
	result, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (deliveries.AttemptRecord, error) {
		var attempt deliveries.AttemptRecord
		err := row.Scan(&attempt.ID, &attempt.ProjectID, &attempt.DeliveryID, &attempt.Cycle, &attempt.AttemptNumber,
			&attempt.StartedAt, &attempt.FinishedAt, &attempt.DurationMS, &attempt.StatusCode, &attempt.Outcome, &attempt.ErrorCode,
			&attempt.ResponseTruncated, &attempt.ResponseReadError, &attempt.DeliveryState, &attempt.TerminalReason, &attempt.RetryAt)
		return attempt, err
	})
	if err != nil {
		return nil, fmt.Errorf("read delivery attempts: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit attempt history read: %w", err)
	}
	return result, nil
}
