package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/deliveries"
)

type lockedDelivery struct {
	deliveries.Lease
	ProjectID, EventID, EndpointID uuid.UUID
	Count, Cycle                   int
	ActiveID                       *uuid.UUID
	StartedAt                      *time.Time
	ExpiresAt, RetryDeadline, Now  time.Time
	URL                            string
	ConfigurationVersion           int64
	Enabled, Verified, Deleted     bool
}

const lockedDeliveryColumns = `d.id, d.lease_owner, d.lease_token, d.project_id, d.event_id, d.endpoint_id,
	d.attempt_count, d.cycle, d.active_attempt_id, d.active_attempt_started_at, d.lease_expires_at,
	d.retry_deadline, e.url, e.verification_version, e.enabled, e.verified_at IS NOT NULL, e.deleted_at IS NOT NULL`

const deliveryJoins = ` FROM deliveries d
	JOIN endpoints e ON e.project_id = d.project_id AND e.id = d.endpoint_id `

func scanLockedDelivery(row pgx.Row, held *lockedDelivery) error {
	return row.Scan(&held.DeliveryID, &held.OwnerID, &held.Token, &held.ProjectID, &held.EventID, &held.EndpointID,
		&held.Count, &held.Cycle, &held.ActiveID, &held.StartedAt, &held.ExpiresAt, &held.RetryDeadline,
		&held.URL, &held.ConfigurationVersion, &held.Enabled, &held.Verified, &held.Deleted)
}

// Endpoint-before-delivery ordering coordinates with configuration changes and
// deletion. No project/event lock is taken after locking delivery child rows.
func lockDeliveryLease(ctx context.Context, tx pgx.Tx, lease deliveries.Lease) (lockedDelivery, error) {
	if lease.DeliveryID == uuid.Nil || lease.OwnerID == uuid.Nil || lease.Token == uuid.Nil {
		return lockedDelivery{}, fmt.Errorf("delivery ID, lease owner, and token are required")
	}
	var endpointID uuid.UUID
	err := tx.QueryRow(ctx, `SELECT e.id FROM deliveries d
		JOIN endpoints e ON e.project_id = d.project_id AND e.id = d.endpoint_id
		WHERE d.id = $1 AND d.lease_owner = $2 AND d.lease_token = $3 AND d.state = 'leased' FOR SHARE OF e`,
		lease.DeliveryID, lease.OwnerID, lease.Token).Scan(&endpointID)
	if errors.Is(err, pgx.ErrNoRows) {
		return lockedDelivery{}, deliveries.ErrLeaseLost
	}
	if err != nil {
		return lockedDelivery{}, fmt.Errorf("lock delivery destination: %w", err)
	}
	var held lockedDelivery
	err = scanLockedDelivery(tx.QueryRow(ctx, `SELECT `+lockedDeliveryColumns+deliveryJoins+`
		WHERE d.id = $1 AND d.lease_owner = $2 AND d.lease_token = $3 AND d.state = 'leased' FOR UPDATE OF d`,
		lease.DeliveryID, lease.OwnerID, lease.Token), &held)
	if errors.Is(err, pgx.ErrNoRows) {
		return lockedDelivery{}, deliveries.ErrLeaseLost
	}
	if err != nil {
		return lockedDelivery{}, fmt.Errorf("lock delivery lease: %w", err)
	}
	// now() is fixed at transaction start. Read the actual database clock
	// after lock acquisition so contention cannot make an expired lease valid.
	if err := tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&held.Now); err != nil {
		return lockedDelivery{}, fmt.Errorf("read delivery database time: %w", err)
	}
	return held, nil
}

// BeginDeliveryAttempt reserves exactly one dispatch intent per lease. Keys are
// decrypted by the worker first; this CAS then verifies they still match the
// current endpoint generation before consuming an attempt.
func (s *Store) BeginDeliveryAttempt(ctx context.Context, job deliveries.Job) (deliveries.Attempt, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return deliveries.Attempt{}, fmt.Errorf("generate delivery attempt ID: %w", err)
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return deliveries.Attempt{}, fmt.Errorf("begin delivery attempt: %w", err)
	}
	defer rollbackTransaction(tx)
	// Serialize the final intent check against operator suspension before
	// acquiring child locks. No database transaction spans the HTTP request.
	suspended, err := lockProjectSuspension(ctx, tx, job.ProjectID)
	if err != nil {
		return deliveries.Attempt{}, err
	}
	held, err := lockDeliveryLease(ctx, tx, job.Lease)
	if err != nil {
		return deliveries.Attempt{}, err
	}
	if !held.ExpiresAt.After(held.Now) {
		return deliveries.Attempt{}, deliveries.ErrLeaseLost
	}
	if held.ActiveID != nil {
		return deliveries.Attempt{}, deliveries.ErrAttemptStarted
	}
	if held.ProjectID != job.ProjectID {
		return deliveries.Attempt{}, deliveries.ErrLeaseLost
	}
	endpointUnavailable := held.Deleted || !held.Enabled || !held.Verified
	configurationChanged := held.ConfigurationVersion != job.ConfigurationVersion || held.URL != job.URL
	retryBudgetExhausted := held.Count >= deliveries.MaxAttempts || !held.RetryDeadline.After(held.Now)
	shortLease := held.ExpiresAt.Sub(held.Now) <= deliveries.AttemptTimeout+10*time.Second
	if suspended || endpointUnavailable || configurationChanged || retryBudgetExhausted || shortLease {
		completion := deliveryCompletion(held, deliveries.Result{Outcome: deliveries.OutcomeInterrupted})
		if err := updateDeliveryLease(ctx, tx, held, completion); err != nil {
			return deliveries.Attempt{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return deliveries.Attempt{}, fmt.Errorf("commit skipped delivery attempt: %w", err)
		}
		return deliveries.Attempt{}, nil
	}
	attempt := deliveries.Attempt{Lease: job.Lease, ID: id, Cycle: held.Cycle}
	err = tx.QueryRow(ctx, `UPDATE deliveries d SET active_attempt_id = $4,
		active_attempt_started_at = clock_timestamp(), attempt_count = attempt_count + 1, updated_at = clock_timestamp()
		WHERE d.id = $1 AND d.lease_owner = $2 AND d.lease_token = $3 AND d.state = 'leased'
		AND d.active_attempt_id IS NULL AND d.attempt_count < $5
		AND d.lease_expires_at > clock_timestamp() + $6::interval
		AND d.retry_deadline > clock_timestamp()
		RETURNING attempt_count, active_attempt_started_at`,
		job.DeliveryID, job.OwnerID, job.Token, id, deliveries.MaxAttempts,
		deliveryInterval(deliveries.AttemptTimeout+10*time.Second),
	).Scan(&attempt.Number, &attempt.StartedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return deliveries.Attempt{}, deliveries.ErrLeaseLost
	}
	if err != nil {
		return deliveries.Attempt{}, fmt.Errorf("reserve delivery attempt: %w", err)
	}
	attempt.Timeout = min(deliveries.AttemptTimeout, held.RetryDeadline.Sub(attempt.StartedAt))
	attempt.UsePreviousSecret = len(job.PreviousSigningSecret) > 0 && job.PreviousSecretExpiresAt != nil && job.PreviousSecretExpiresAt.After(attempt.StartedAt)
	if err := tx.Commit(ctx); err != nil {
		// Never send after an ambiguous intent commit. Recovery appends an
		// interrupted outcome if the intent actually became durable.
		return deliveries.Attempt{}, fmt.Errorf("commit delivery attempt: %w", err)
	}
	return attempt, nil
}

// CompleteDelivery atomically appends an immutable outcome and transitions its
// job. Repeating it after a lost commit acknowledgement returns the first result
// without modifying a newer lease or rewriting the recorded attempt.
func (s *Store) CompleteDelivery(ctx context.Context, attempt deliveries.Attempt, result deliveries.Result) (deliveries.Completion, error) {
	if attempt.ID == uuid.Nil {
		return deliveries.Completion{}, fmt.Errorf("delivery attempt ID is required")
	}
	if err := result.Validate(); err != nil {
		return deliveries.Completion{}, err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return deliveries.Completion{}, fmt.Errorf("begin delivery completion: %w", err)
	}
	defer rollbackTransaction(tx)
	if completion, found, err := recordedCompletion(ctx, tx, attempt); err != nil || found {
		return completion, err
	}
	held, err := lockDeliveryLease(ctx, tx, attempt.Lease)
	if err != nil {
		if errors.Is(err, deliveries.ErrLeaseLost) {
			if completion, found, lookupErr := recordedCompletion(ctx, tx, attempt); lookupErr != nil || found {
				return completion, lookupErr
			}
		}
		return deliveries.Completion{}, err
	}
	if !held.ExpiresAt.After(held.Now) || held.ActiveID == nil || *held.ActiveID != attempt.ID || held.Count != attempt.Number || held.Cycle != attempt.Cycle {
		return deliveries.Completion{}, deliveries.ErrLeaseLost
	}
	completion := deliveryCompletion(held, result)
	if err := appendDeliveryAttempt(ctx, tx, held, result, completion); err != nil {
		return deliveries.Completion{}, err
	}
	if err := updateDeliveryLease(ctx, tx, held, completion); err != nil {
		return deliveries.Completion{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return deliveries.Completion{}, fmt.Errorf("commit delivery completion: %w", err)
	}
	return completion, nil
}

func recordedCompletion(ctx context.Context, tx pgx.Tx, attempt deliveries.Attempt) (deliveries.Completion, bool, error) {
	var completion deliveries.Completion
	err := tx.QueryRow(ctx, `SELECT delivery_state, retry_at, coalesce(terminal_reason, '') FROM delivery_attempts
		WHERE id = $1 AND delivery_id = $2 AND lease_owner = $3 AND lease_token = $4`,
		attempt.ID, attempt.DeliveryID, attempt.OwnerID, attempt.Token,
	).Scan(&completion.State, &completion.NextAttemptAt, &completion.TerminalReason)
	if errors.Is(err, pgx.ErrNoRows) {
		return completion, false, nil
	}
	if err != nil {
		return completion, false, fmt.Errorf("find recorded delivery attempt: %w", err)
	}
	return completion, true, nil
}

func deliveryCompletion(held lockedDelivery, result deliveries.Result) deliveries.Completion {
	if result.Outcome == deliveries.OutcomeSucceeded {
		return deliveries.Completion{State: deliveries.Succeeded}
	}
	if result.Outcome == deliveries.OutcomeTerminal {
		reason := result.ErrorCode
		if reason == "" {
			reason = "unexpected_status"
		}
		return deliveries.Completion{State: deliveries.Failed, TerminalReason: reason}
	}
	if held.Deleted {
		return deliveries.Completion{State: deliveries.Canceled}
	}
	if held.Count >= deliveries.MaxAttempts {
		return deliveries.Completion{State: deliveries.Failed, TerminalReason: "max_attempts"}
	}
	at := result.RetryAt(held.Now)
	if !at.Before(held.RetryDeadline) {
		return deliveries.Completion{State: deliveries.Failed, TerminalReason: "retry_horizon"}
	}
	return deliveries.Completion{State: deliveries.Pending, NextAttemptAt: &at}
}

func appendDeliveryAttempt(ctx context.Context, tx pgx.Tx, held lockedDelivery, result deliveries.Result, completion deliveries.Completion) error {
	_, err := tx.Exec(ctx, `INSERT INTO delivery_attempts
		(id, project_id, delivery_id, cycle, attempt_number, lease_token, lease_owner, started_at, finished_at,
		duration_ms, status_code, outcome, error_code, response_truncated, response_read_error, delivery_state, terminal_reason, retry_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,nullif($11,0),$12,nullif($13,''),$14,$15,$16,nullif($17,''),$18)`,
		held.ActiveID, held.ProjectID, held.DeliveryID, held.Cycle, held.Count, held.Token, held.OwnerID,
		held.StartedAt, held.Now, result.Duration.Milliseconds(), result.StatusCode, result.Outcome, result.ErrorCode,
		result.ResponseTruncated, result.ResponseReadError, completion.State, completion.TerminalReason, completion.NextAttemptAt)
	if err != nil {
		return fmt.Errorf("append delivery attempt: %w", err)
	}
	return nil
}

func updateDeliveryLease(ctx context.Context, tx pgx.Tx, held lockedDelivery, completion deliveries.Completion) error {
	result, err := tx.Exec(ctx, `UPDATE deliveries SET state = $4, next_attempt_at = coalesce($5, next_attempt_at),
		terminal_reason = nullif($6,''), lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
		active_attempt_id = NULL, active_attempt_started_at = NULL, updated_at = clock_timestamp()
		WHERE id = $1 AND lease_owner = $2 AND lease_token = $3 AND state = 'leased'`,
		held.DeliveryID, held.OwnerID, held.Token, completion.State, completion.NextAttemptAt, completion.TerminalReason)
	if err != nil {
		return fmt.Errorf("transition delivery lease: %w", err)
	}
	if result.RowsAffected() != 1 {
		return deliveries.ErrLeaseLost
	}
	return nil
}
