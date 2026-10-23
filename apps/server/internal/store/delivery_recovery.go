package store

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/deliveries"
)

func (s *Store) RecoverDeliveryLeases(ctx context.Context, limit int) (int64, error) {
	return s.releaseDeliveryBatch(ctx, uuid.Nil, limit, "lease_expired")
}

// ReleaseWorkerLeases is called after dispatch stops and in-flight work is
// finished or canceled. It handles both unsent reservations and active intent.
func (s *Store) ReleaseWorkerLeases(ctx context.Context, ownerID uuid.UUID) (int64, error) {
	if ownerID == uuid.Nil {
		return 0, fmt.Errorf("delivery lease owner is required")
	}
	var total int64
	for {
		count, err := s.releaseDeliveryBatch(ctx, ownerID, deliveries.MaxClaimBatch, "worker_shutdown")
		total += count
		if err != nil {
			return total, err
		}
		if count > 0 {
			continue
		}
		var remaining bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM deliveries d
			JOIN projects p ON p.id = d.project_id JOIN organizations o ON o.id = p.organization_id
			WHERE d.state = 'leased' AND d.lease_owner = $1
			AND p.deletion_requested_at IS NULL AND o.deletion_requested_at IS NULL)`, ownerID).Scan(&remaining); err != nil {
			return total, fmt.Errorf("check remaining worker leases: %w", err)
		}
		if !remaining {
			return total, nil
		}
		timer := time.NewTimer(100 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return total, ctx.Err()
		case <-timer.C:
		}
	}
}

func (s *Store) releaseDeliveryBatch(ctx context.Context, ownerID uuid.UUID, limit int, code string) (int64, error) {
	if err := validateDeliveryBatch(limit); err != nil {
		return 0, err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return 0, fmt.Errorf("begin delivery lease recovery: %w", err)
	}
	defer rollbackTransaction(tx)
	// Predicates are fixed SQL, never caller-supplied text. Keep separate
	// expiry/owner predicates so PostgreSQL can use their partial indexes.
	predicate := `d.lease_expires_at <= now()`
	args := []any{limit}
	if ownerID != uuid.Nil {
		predicate = `d.lease_owner = $2`
		args = append(args, ownerID)
	}
	rows, err := tx.Query(ctx, `SELECT `+lockedDeliveryColumns+deliveryJoins+`
		JOIN projects p ON p.id = d.project_id
		JOIN organizations o ON o.id = p.organization_id
		WHERE d.state = 'leased' AND p.deletion_requested_at IS NULL
		AND o.deletion_requested_at IS NULL AND `+predicate+`
		ORDER BY d.lease_expires_at, d.id LIMIT $1
		FOR UPDATE OF d SKIP LOCKED FOR SHARE OF o, p, e SKIP LOCKED`, args...)
	if err != nil {
		return 0, fmt.Errorf("select recoverable delivery leases: %w", err)
	}
	jobs, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (lockedDelivery, error) {
		var held lockedDelivery
		err := scanLockedDelivery(row, &held)
		return held, err
	})
	if err != nil {
		return 0, fmt.Errorf("read recoverable delivery leases: %w", err)
	}
	if len(jobs) == 0 {
		return 0, nil
	}
	// Recovery can finalize several tenants in one transaction. Acquire their
	// shared accounting rows in a consistent tenant order to avoid mutual waits.
	projectIDs := make([]uuid.UUID, 0, len(jobs))
	for _, job := range jobs {
		projectIDs = append(projectIDs, job.ProjectID)
	}
	parents, err := tx.Query(ctx, `SELECT id,organization_id FROM projects WHERE id = ANY($1::uuid[])`, projectIDs)
	if err != nil {
		return 0, fmt.Errorf("read recovery accounting order: %w", err)
	}
	organizations := make(map[uuid.UUID]string)
	for parents.Next() {
		var projectID, organizationID uuid.UUID
		if err := parents.Scan(&projectID, &organizationID); err != nil {
			parents.Close()
			return 0, fmt.Errorf("read recovery tenant: %w", err)
		}
		organizations[projectID] = organizationID.String()
	}
	if err := parents.Err(); err != nil {
		return 0, fmt.Errorf("read recovery tenants: %w", err)
	}
	parents.Close()
	sort.SliceStable(jobs, func(i, j int) bool {
		return organizations[jobs[i].ProjectID] < organizations[jobs[j].ProjectID]
	})
	var databaseNow time.Time
	if err := tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&databaseNow); err != nil {
		return 0, fmt.Errorf("read recovery database time: %w", err)
	}
	var count int64
	for _, held := range jobs {
		held.Now = databaseNow
		if ownerID == uuid.Nil && held.ExpiresAt.After(databaseNow) {
			continue
		}
		outcome := deliveries.Result{Outcome: deliveries.OutcomeInterrupted, ErrorCode: code}
		completion := deliveryCompletion(held, outcome)
		if held.ActiveID != nil {
			outcome.Duration = max(databaseNow.Sub(*held.StartedAt), 0)
			if err := appendDeliveryAttempt(ctx, tx, held, outcome, completion); err != nil {
				return 0, err
			}
		}
		if err := updateDeliveryLease(ctx, tx, held, completion); err != nil {
			return 0, err
		}
		count++
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit delivery lease recovery: %w", err)
	}
	return count, nil
}

func (s *Store) ExpirePendingDeliveries(ctx context.Context, limit int) (int64, error) {
	if err := validateDeliveryBatch(limit); err != nil {
		return 0, err
	}
	result, err := s.pool.Exec(ctx, `WITH expired AS (
		SELECT d.id, e.deleted_at, d.attempt_count FROM deliveries d
		JOIN endpoints e ON e.project_id = d.project_id AND e.id = d.endpoint_id
		JOIN projects p ON p.id = d.project_id JOIN organizations o ON o.id = p.organization_id
		WHERE d.state = 'pending' AND p.deletion_requested_at IS NULL AND o.deletion_requested_at IS NULL
		AND (d.attempt_count >= $2 OR d.retry_deadline <= now())
		ORDER BY d.next_attempt_at, d.id LIMIT $1
		FOR UPDATE OF d SKIP LOCKED FOR SHARE OF o,p,e SKIP LOCKED
	) UPDATE deliveries d SET state = CASE WHEN expired.deleted_at IS NOT NULL THEN 'canceled' ELSE 'failed' END,
		terminal_reason = CASE WHEN expired.deleted_at IS NOT NULL THEN NULL
			WHEN expired.attempt_count >= $2 THEN 'max_attempts' ELSE 'retry_horizon' END,
		updated_at = now() FROM expired WHERE d.id = expired.id AND d.state = 'pending'`,
		limit, deliveries.MaxAttempts)
	if err != nil {
		return 0, fmt.Errorf("expire pending deliveries: %w", err)
	}
	return result.RowsAffected(), nil
}
