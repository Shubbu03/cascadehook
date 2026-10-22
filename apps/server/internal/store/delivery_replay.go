package store

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/auth"
	"cascadehook/internal/deliveries"
)

// ReplayDelivery grants a new bounded cycle to the existing event/destination
// job. The caller must provide its observed cycle; a persisted receipt makes
// retries safe even after that new cycle has already finished or been replayed.
func (s *Store) ReplayDelivery(ctx context.Context, principal auth.Principal, deliveryID uuid.UUID, expectedCycle int) (deliveries.Replay, error) {
	if err := deliveries.ValidateReplayCycle(expectedCycle); err != nil {
		return deliveries.Replay{}, err
	}
	if !principal.Valid() || deliveryID == uuid.Nil {
		return deliveries.Replay{}, fmt.Errorf("project, actor, and delivery IDs are required")
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return deliveries.Replay{}, fmt.Errorf("begin delivery replay: %w", err)
	}
	defer rollbackTransaction(tx)
	if principal.UserID != uuid.Nil {
		if _, err := lockHumanProjectAccess(ctx, tx, principal); err != nil {
			return deliveries.Replay{}, err
		}
	}
	// After organization authorization, match mutation/lease child ordering:
	// destination first, then delivery.
	// No parent project/event/API-key locks are acquired after the child lock.
	var enabled, verified, deleted, hasSecret bool
	err = tx.QueryRow(ctx, `SELECT e.enabled, e.verified_at IS NOT NULL, e.deleted_at IS NOT NULL, e.signing_secret IS NOT NULL
		FROM endpoints e JOIN deliveries d ON d.project_id = e.project_id AND d.endpoint_id = e.id
		WHERE d.project_id = $1 AND d.id = $2 FOR SHARE OF e`, principal.ProjectID, deliveryID,
	).Scan(&enabled, &verified, &deleted, &hasSecret)
	if errors.Is(err, pgx.ErrNoRows) {
		return deliveries.Replay{}, deliveries.ErrNotFound
	}
	if err != nil {
		return deliveries.Replay{}, fmt.Errorf("lock replay destination: %w", err)
	}
	var cycle, attemptCount int
	var state deliveries.State
	var terminalReason *string
	err = tx.QueryRow(ctx, `SELECT cycle, state, attempt_count, terminal_reason
		FROM deliveries WHERE project_id = $1 AND id = $2 FOR UPDATE`,
		principal.ProjectID, deliveryID).Scan(&cycle, &state, &attemptCount, &terminalReason)
	if errors.Is(err, pgx.ErrNoRows) {
		return deliveries.Replay{}, deliveries.ErrNotFound
	}
	if err != nil {
		return deliveries.Replay{}, fmt.Errorf("lock replay delivery: %w", err)
	}
	// Read after the delivery lock, so a concurrent replay's committed receipt
	// is visible. Returning it is read-only, regardless of today's queue state
	// or destination eligibility; it never grants another window.
	if receipt, found, err := recordedDeliveryReplay(ctx, tx, principal.ProjectID, deliveryID, expectedCycle); err != nil || found {
		return receipt, err
	}
	if cycle != expectedCycle {
		return deliveries.Replay{}, deliveries.ErrReplayCycleChanged
	}
	if state != deliveries.Succeeded && state != deliveries.Failed {
		return deliveries.Replay{}, deliveries.ErrReplayNotAllowed
	}
	if deleted || !enabled || !verified || !hasSecret {
		return deliveries.Replay{}, deliveries.ErrReplayEndpointNotReady
	}
	if cycle == math.MaxInt32 {
		return deliveries.Replay{}, deliveries.ErrReplayCycleLimit
	}
	id, err := uuid.NewV7()
	if err != nil {
		return deliveries.Replay{}, fmt.Errorf("generate delivery replay ID: %w", err)
	}
	// Read the actual database time after all contended locks. The original
	// event timestamps, payload, fan-out count, and attempt rows are untouched.
	var databaseNow time.Time
	if err := tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&databaseNow); err != nil {
		return deliveries.Replay{}, fmt.Errorf("read replay database time: %w", err)
	}
	receipt := deliveries.Replay{ID: id, DeliveryID: deliveryID, FromCycle: cycle, Cycle: cycle + 1,
		CreatedAt: databaseNow, RetryDeadline: databaseNow.Add(deliveries.RetryHorizon)}
	result, err := tx.Exec(ctx, `UPDATE deliveries SET state = 'pending', cycle = cycle + 1, attempt_count = 0,
		cycle_started_at = $4, retry_deadline = $5, next_attempt_at = $4, terminal_reason = NULL,
		lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
		active_attempt_id = NULL, active_attempt_started_at = NULL, updated_at = $4
		WHERE project_id = $1 AND id = $2 AND cycle = $3 AND state IN ('succeeded', 'failed')`,
		principal.ProjectID, deliveryID, expectedCycle, receipt.CreatedAt, receipt.RetryDeadline)
	if err != nil {
		return deliveries.Replay{}, fmt.Errorf("requeue delivery for replay: %w", err)
	}
	if result.RowsAffected() != 1 {
		return deliveries.Replay{}, deliveries.ErrReplayCycleChanged
	}
	_, err = tx.Exec(ctx, `INSERT INTO delivery_replays
		(id, project_id, delivery_id, from_cycle, cycle, from_state, api_key_id, user_id, created_at, retry_deadline,
		from_attempt_count, from_terminal_reason)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, receipt.ID, principal.ProjectID, deliveryID,
		receipt.FromCycle, receipt.Cycle, state, nullableUUID(principal.APIKeyID), nullableUUID(principal.UserID),
		receipt.CreatedAt, receipt.RetryDeadline, attemptCount, terminalReason)
	if err != nil {
		return deliveries.Replay{}, fmt.Errorf("record delivery replay: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		// The client can retry with the same observed cycle after an uncertain
		// commit. The durable receipt distinguishes acceptance from rollback.
		return deliveries.Replay{}, fmt.Errorf("commit delivery replay: %w", err)
	}
	return receipt, nil
}

func recordedDeliveryReplay(ctx context.Context, tx pgx.Tx, projectID, deliveryID uuid.UUID, fromCycle int) (deliveries.Replay, bool, error) {
	var receipt deliveries.Replay
	err := tx.QueryRow(ctx, `SELECT id, delivery_id, from_cycle, cycle, created_at, retry_deadline
		FROM delivery_replays WHERE project_id = $1 AND delivery_id = $2 AND from_cycle = $3`,
		projectID, deliveryID, fromCycle).Scan(&receipt.ID, &receipt.DeliveryID, &receipt.FromCycle,
		&receipt.Cycle, &receipt.CreatedAt, &receipt.RetryDeadline)
	if errors.Is(err, pgx.ErrNoRows) {
		return receipt, false, nil
	}
	if err != nil {
		return receipt, false, fmt.Errorf("find recorded delivery replay: %w", err)
	}
	receipt.Replayed = true
	return receipt, true, nil
}
