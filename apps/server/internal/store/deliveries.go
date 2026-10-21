package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"cascadehook/internal/deliveries"
)

// ClaimDeliveries reserves due work without waiting for other claimers or
// endpoint changes. Locks are held only until all reservations are committed;
// no database transaction is held open while the sender performs network I/O.
func (s *Store) ClaimDeliveries(ctx context.Context, ownerID uuid.UUID, limit int) ([]deliveries.Job, error) {
	if ownerID == uuid.Nil {
		return nil, fmt.Errorf("delivery lease owner is required")
	}
	if err := validateDeliveryBatch(limit); err != nil {
		return nil, err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return nil, fmt.Errorf("begin delivery claim: %w", err)
	}
	defer rollbackTransaction(tx)

	// SHARE on the endpoint blocks URL changes, disable, and soft deletion
	// during this short transaction, while allowing other claimers to share
	// the destination. Both lock clauses skip contention so a deletion holding
	// an endpoint lock and waiting for a delivery cannot deadlock the claim.
	rows, err := tx.Query(ctx, `SELECT d.id, d.project_id, d.event_id, d.endpoint_id,
		e.url, v.event_type, v.payload, v.created_at, d.attempt_count, d.cycle
		FROM deliveries d
		JOIN endpoints e ON e.project_id = d.project_id AND e.id = d.endpoint_id
		JOIN events v ON v.project_id = d.project_id AND v.id = d.event_id
		WHERE d.state = 'pending' AND d.next_attempt_at <= now()
		AND e.enabled AND e.verified_at IS NOT NULL AND e.deleted_at IS NULL
		AND d.attempt_count < $2 AND v.created_at + $3::interval > now()
		ORDER BY d.next_attempt_at, d.id LIMIT $1
		FOR UPDATE OF d SKIP LOCKED FOR SHARE OF e SKIP LOCKED`,
		limit, deliveries.MaxAttempts, deliveryInterval(deliveries.RetryHorizon))
	if err != nil {
		return nil, fmt.Errorf("select due deliveries: %w", err)
	}
	jobs, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (deliveries.Job, error) {
		var job deliveries.Job
		err := row.Scan(&job.DeliveryID, &job.ProjectID, &job.EventID, &job.EndpointID,
			&job.URL, &job.EventType, &job.Payload, &job.EventCreatedAt, &job.AttemptCount, &job.Cycle)
		return job, err
	})
	if err != nil {
		return nil, fmt.Errorf("read due deliveries: %w", err)
	}
	if len(jobs) == 0 {
		return jobs, nil
	}

	ids := make([]pgtype.UUID, len(jobs))
	tokens := make([]pgtype.UUID, len(jobs))
	for i := range jobs {
		token, err := uuid.NewV7()
		if err != nil {
			return nil, fmt.Errorf("generate delivery lease token: %w", err)
		}
		jobs[i].OwnerID = ownerID
		jobs[i].Token = token
		ids[i] = pgtype.UUID{Bytes: [16]byte(jobs[i].DeliveryID), Valid: true}
		tokens[i] = pgtype.UUID{Bytes: [16]byte(token), Valid: true}
	}
	// Every row in this batch uses the same database timestamp, so expiry can
	// be returned once without depending on UPDATE's unspecified row order.
	var expiresAt time.Time
	err = tx.QueryRow(ctx, `WITH claimed AS (
		UPDATE deliveries d SET state = 'leased', lease_owner = $1,
			lease_token = claims.token, lease_expires_at = now() + $4::interval, updated_at = now()
		FROM unnest($2::uuid[], $3::uuid[]) AS claims(id, token)
		WHERE d.id = claims.id AND d.state = 'pending'
		RETURNING d.lease_expires_at
	) SELECT min(lease_expires_at) FROM claimed HAVING count(*) = $5`,
		ownerID, ids, tokens, deliveryInterval(deliveries.LeaseDuration), len(jobs)).Scan(&expiresAt)
	if err != nil {
		return nil, fmt.Errorf("assign delivery leases: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		// An uncertain commit is never handed to the sender. Recovery will
		// reclaim any reservations that did commit after their leases expire.
		return nil, fmt.Errorf("commit delivery claim: %w", err)
	}
	for i := range jobs {
		jobs[i].LeaseExpiresAt = expiresAt
	}
	return jobs, nil
}

// CompleteDelivery fences queue transitions with the owner, token, state, and
// database expiry. This is not yet an attempt recorder or an HTTP sender.
func (s *Store) CompleteDelivery(ctx context.Context, lease deliveries.Lease, completion deliveries.Completion) (deliveries.State, error) {
	switch completion.State {
	case deliveries.Pending:
		if completion.RetryAfter <= 0 || completion.RetryAfter > deliveries.RetryHorizon {
			return "", fmt.Errorf("delivery retry delay must be positive and at most %s", deliveries.RetryHorizon)
		}
	case deliveries.Succeeded, deliveries.Failed:
		if completion.RetryAfter != 0 {
			return "", fmt.Errorf("terminal delivery completion cannot schedule a retry")
		}
	default:
		return "", fmt.Errorf("invalid delivery completion state %q", completion.State)
	}
	return s.resolveDeliveryLease(ctx, lease, completion)
}

// ReleaseDelivery returns an unprocessed reservation without consuming an
// attempt. It cannot release a replacement lease, even from the same worker.
func (s *Store) ReleaseDelivery(ctx context.Context, lease deliveries.Lease) (deliveries.State, error) {
	return s.resolveDeliveryLease(ctx, lease, deliveries.Completion{State: deliveries.Pending})
}

func (s *Store) resolveDeliveryLease(ctx context.Context, lease deliveries.Lease, completion deliveries.Completion) (deliveries.State, error) {
	if lease.DeliveryID == uuid.Nil || lease.OwnerID == uuid.Nil || lease.Token == uuid.Nil {
		return "", fmt.Errorf("delivery ID, lease owner, and token are required")
	}
	var state deliveries.State
	// Take the endpoint's shared lock before updating the delivery. Reading
	// deleted_at without a lock could requeue a job just after endpoint
	// deletion finished canceling its pending work. The final UPDATE rechecks
	// lease credentials because the CTE does not lock the delivery itself.
	err := s.pool.QueryRow(ctx, `WITH owned AS MATERIALIZED (
		SELECT d.id, e.deleted_at, v.created_at AS event_created_at
		FROM deliveries d
		JOIN endpoints e ON e.project_id = d.project_id AND e.id = d.endpoint_id
		JOIN events v ON v.project_id = d.project_id AND v.id = d.event_id
		WHERE d.id = $1 AND d.lease_owner = $2 AND d.lease_token = $3
		AND d.state = 'leased' AND d.lease_expires_at > now()
		FOR SHARE OF e
	) UPDATE deliveries d SET
		state = CASE
			WHEN $4 = 'pending' AND owned.deleted_at IS NOT NULL THEN 'canceled'
			WHEN $4 = 'pending' AND (d.attempt_count >= $6 OR now() + $5::interval >= owned.event_created_at + $7::interval) THEN 'failed'
			ELSE $4 END,
		next_attempt_at = CASE WHEN $4 = 'pending' THEN now() + $5::interval ELSE d.next_attempt_at END,
		lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = now()
		FROM owned
		WHERE d.id = owned.id AND d.lease_owner = $2 AND d.lease_token = $3
		AND d.state = 'leased' AND d.lease_expires_at > now()
		RETURNING d.state`, lease.DeliveryID, lease.OwnerID, lease.Token, completion.State,
		deliveryInterval(completion.RetryAfter), deliveries.MaxAttempts, deliveryInterval(deliveries.RetryHorizon),
	).Scan(&state)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", deliveries.ErrLeaseLost
	}
	if err != nil {
		return "", fmt.Errorf("resolve delivery lease: %w", err)
	}
	return state, nil
}

// RecoverDeliveryLeases requeues a bounded batch after a process crash. The
// cleared token immediately fences the previous holder. Disabled endpoints
// remain paused because subsequent claims skip them; deleted ones are canceled.
func (s *Store) RecoverDeliveryLeases(ctx context.Context, limit int) (int64, error) {
	if err := validateDeliveryBatch(limit); err != nil {
		return 0, err
	}
	result, err := s.pool.Exec(ctx, `WITH expired AS (
		SELECT d.id, e.deleted_at, v.created_at AS event_created_at FROM deliveries d
		JOIN endpoints e ON e.project_id = d.project_id AND e.id = d.endpoint_id
		JOIN events v ON v.project_id = d.project_id AND v.id = d.event_id
		WHERE d.state = 'leased' AND d.lease_expires_at <= now()
		ORDER BY d.lease_expires_at, d.id LIMIT $1
		FOR UPDATE OF d SKIP LOCKED FOR SHARE OF e SKIP LOCKED
	) UPDATE deliveries d SET
		state = CASE WHEN expired.deleted_at IS NOT NULL THEN 'canceled'
			WHEN d.attempt_count >= $2 OR expired.event_created_at + $3::interval <= now() THEN 'failed'
			ELSE 'pending' END,
		next_attempt_at = greatest(d.next_attempt_at, now()),
		lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = now()
		FROM expired WHERE d.id = expired.id AND d.state = 'leased' AND d.lease_expires_at <= now()`,
		limit, deliveries.MaxAttempts, deliveryInterval(deliveries.RetryHorizon))
	if err != nil {
		return 0, fmt.Errorf("recover delivery leases: %w", err)
	}
	return result.RowsAffected(), nil
}

// ExpirePendingDeliveries terminalizes jobs whose retry budget has ended,
// including paused destinations, so ineligible work cannot remain pending forever.
func (s *Store) ExpirePendingDeliveries(ctx context.Context, limit int) (int64, error) {
	if err := validateDeliveryBatch(limit); err != nil {
		return 0, err
	}
	result, err := s.pool.Exec(ctx, `WITH expired AS (
		SELECT d.id, e.deleted_at FROM deliveries d
		JOIN endpoints e ON e.project_id = d.project_id AND e.id = d.endpoint_id
		JOIN events v ON v.project_id = d.project_id AND v.id = d.event_id
		WHERE d.state = 'pending' AND (d.attempt_count >= $2 OR v.created_at + $3::interval <= now())
		ORDER BY d.next_attempt_at, d.id LIMIT $1
		FOR UPDATE OF d SKIP LOCKED FOR SHARE OF e SKIP LOCKED
	) UPDATE deliveries d SET state = CASE WHEN expired.deleted_at IS NOT NULL THEN 'canceled' ELSE 'failed' END,
		updated_at = now() FROM expired WHERE d.id = expired.id AND d.state = 'pending'`,
		limit, deliveries.MaxAttempts, deliveryInterval(deliveries.RetryHorizon))
	if err != nil {
		return 0, fmt.Errorf("expire pending deliveries: %w", err)
	}
	return result.RowsAffected(), nil
}

// ReleaseWorkerLeases is called only after a process stops claiming and its
// in-flight work has finished or been canceled. Each process uses a fresh owner
// ID at startup, so shutdown cannot release another process's reservations.
func (s *Store) ReleaseWorkerLeases(ctx context.Context, ownerID uuid.UUID) (int64, error) {
	if ownerID == uuid.Nil {
		return 0, fmt.Errorf("delivery lease owner is required")
	}
	result, err := s.pool.Exec(ctx, `WITH owned AS MATERIALIZED (
		SELECT d.id, d.lease_token, e.deleted_at, v.created_at AS event_created_at FROM deliveries d
		JOIN endpoints e ON e.project_id = d.project_id AND e.id = d.endpoint_id
		JOIN events v ON v.project_id = d.project_id AND v.id = d.event_id
		WHERE d.state = 'leased' AND d.lease_owner = $1
		ORDER BY e.id, d.id FOR SHARE OF e
	) UPDATE deliveries d SET
		state = CASE WHEN owned.deleted_at IS NOT NULL THEN 'canceled'
			WHEN d.attempt_count >= $2 OR owned.event_created_at + $3::interval <= now() THEN 'failed'
			ELSE 'pending' END,
		next_attempt_at = greatest(d.next_attempt_at, now()),
		lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = now()
		FROM owned WHERE d.id = owned.id AND d.state = 'leased'
		AND d.lease_owner = $1 AND d.lease_token = owned.lease_token`,
		ownerID, deliveries.MaxAttempts, deliveryInterval(deliveries.RetryHorizon))
	if err != nil {
		return 0, fmt.Errorf("release worker leases: %w", err)
	}
	return result.RowsAffected(), nil
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
