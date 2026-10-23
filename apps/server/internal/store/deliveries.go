package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"cascadehook/internal/deliveries"
)

// ClaimDeliveries reserves only available worker capacity. Endpoint exclusions
// let a process skip destinations already at its local concurrency limit.
func (s *Store) ClaimDeliveries(ctx context.Context, ownerID uuid.UUID, limit int, excluded []uuid.UUID) ([]deliveries.Job, error) {
	if ownerID == uuid.Nil {
		return nil, fmt.Errorf("delivery lease owner is required")
	}
	if err := validateDeliveryBatch(limit); err != nil {
		return nil, err
	}
	excludedIDs := make([]pgtype.UUID, len(excluded))
	for i, id := range excluded {
		excludedIDs[i] = pgtype.UUID{Bytes: [16]byte(id), Valid: true}
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return nil, fmt.Errorf("begin delivery claim: %w", err)
	}
	defer rollbackTransaction(tx)
	rows, err := tx.Query(ctx, `SELECT d.id, d.project_id, d.event_id, d.endpoint_id,
		e.url, v.event_type, v.payload, v.created_at, d.attempt_count, d.cycle,
		e.verification_version, e.signing_secret,
		CASE WHEN e.previous_secret_expires_at > now() THEN e.previous_signing_secret ELSE NULL END,
		e.previous_secret_expires_at
		FROM deliveries d
		JOIN endpoints e ON e.project_id = d.project_id AND e.id = d.endpoint_id
		JOIN events v ON v.project_id = d.project_id AND v.id = d.event_id
		JOIN projects p ON p.id = d.project_id
		WHERE d.state = 'pending' AND d.next_attempt_at <= now()
		AND p.suspended_at IS NULL
		AND v.purge_started_at IS NULL
		AND e.enabled AND e.verified_at IS NOT NULL AND e.deleted_at IS NULL AND e.signing_secret IS NOT NULL
		AND d.attempt_count < $2 AND d.retry_deadline > now()
		AND NOT (d.endpoint_id = ANY($3::uuid[]))
		ORDER BY d.next_attempt_at, d.id LIMIT $1
		FOR UPDATE OF d SKIP LOCKED FOR SHARE OF e SKIP LOCKED`,
		limit, deliveries.MaxAttempts, excludedIDs)
	if err != nil {
		return nil, fmt.Errorf("select due deliveries: %w", err)
	}
	jobs, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (deliveries.Job, error) {
		var job deliveries.Job
		err := row.Scan(&job.DeliveryID, &job.ProjectID, &job.EventID, &job.EndpointID,
			&job.URL, &job.EventType, &job.Payload, &job.EventCreatedAt, &job.AttemptCount, &job.Cycle,
			&job.ConfigurationVersion, &job.SigningSecret, &job.PreviousSigningSecret, &job.PreviousSecretExpiresAt)
		return job, err
	})
	if err != nil {
		return nil, fmt.Errorf("read due deliveries: %w", err)
	}
	if len(jobs) == 0 {
		return jobs, nil
	}
	ids, tokens := make([]pgtype.UUID, len(jobs)), make([]pgtype.UUID, len(jobs))
	for i := range jobs {
		token, err := uuid.NewV7()
		if err != nil {
			return nil, fmt.Errorf("generate delivery lease token: %w", err)
		}
		jobs[i].OwnerID, jobs[i].Token = ownerID, token
		ids[i] = pgtype.UUID{Bytes: [16]byte(jobs[i].DeliveryID), Valid: true}
		tokens[i] = pgtype.UUID{Bytes: [16]byte(token), Valid: true}
	}
	var expiresAt time.Time
	err = tx.QueryRow(ctx, `WITH claimed AS (
		UPDATE deliveries d SET state = 'leased', lease_owner = $1, terminal_reason = NULL,
			lease_token = claims.token, lease_expires_at = now() + $4::interval, updated_at = now()
		FROM unnest($2::uuid[], $3::uuid[]) AS claims(id, token)
		WHERE d.id = claims.id AND d.state = 'pending' RETURNING d.lease_expires_at
	) SELECT min(lease_expires_at) FROM claimed HAVING count(*) = $5`,
		ownerID, ids, tokens, deliveryInterval(deliveries.LeaseDuration), len(jobs)).Scan(&expiresAt)
	if err != nil {
		return nil, fmt.Errorf("assign delivery leases: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		// An ambiguous commit is never dispatched. Recovery handles any leases
		// that committed after the client lost its acknowledgement.
		return nil, fmt.Errorf("commit delivery claim: %w", err)
	}
	for i := range jobs {
		jobs[i].LeaseExpiresAt = expiresAt
	}
	return jobs, nil
}

// ReleaseDelivery defers a reservation that has not started an attempt. Active
// attempts must be completed or finalized by recovery/shutdown, never erased.
func (s *Store) ReleaseDelivery(ctx context.Context, lease deliveries.Lease, delay time.Duration) (deliveries.Completion, error) {
	if delay < 0 || delay > deliveries.RetryHorizon {
		return deliveries.Completion{}, fmt.Errorf("invalid reservation release delay")
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return deliveries.Completion{}, fmt.Errorf("begin delivery release: %w", err)
	}
	defer rollbackTransaction(tx)
	held, err := lockDeliveryLease(ctx, tx, lease)
	if err != nil {
		return deliveries.Completion{}, err
	}
	if !held.ExpiresAt.After(held.Now) {
		return deliveries.Completion{}, deliveries.ErrLeaseLost
	}
	if held.ActiveID != nil {
		return deliveries.Completion{}, deliveries.ErrAttemptStarted
	}
	completion := deliveryCompletion(held, deliveries.Result{Outcome: deliveries.OutcomeInterrupted, RetryDelay: delay})
	if err := updateDeliveryLease(ctx, tx, held, completion); err != nil {
		return deliveries.Completion{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return deliveries.Completion{}, fmt.Errorf("commit delivery release: %w", err)
	}
	return completion, nil
}

func validateDeliveryBatch(limit int) error {
	if limit < 1 || limit > deliveries.MaxClaimBatch {
		return fmt.Errorf("delivery batch size must be between 1 and %d", deliveries.MaxClaimBatch)
	}
	return nil
}

func deliveryInterval(duration time.Duration) pgtype.Interval {
	return pgtype.Interval{Microseconds: duration.Microseconds(), Valid: true}
}
