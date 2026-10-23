package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"cascadehook/internal/retention"
)

// This namespace is shared only by cooperating cleanup batches. Transaction
// ownership releases it automatically after cancellation, failure, or commit.
const retentionBatchLock int64 = 0x4348524554454e54

const retentionEligibility = `e.purge_started_at IS NULL AND e.created_at <= $1
	AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.event_id = e.id AND d.state IN ('pending', 'leased'))
	AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.event_id = e.id AND d.updated_at > $1)
	AND NOT EXISTS (SELECT 1 FROM event_idempotency_keys k WHERE k.event_id = e.id AND k.expires_at > $2)`

// Finish the current retired set before admitting another. An event with many
// attempts cannot cause an ever-growing backlog of newly hidden event groups.
const retentionMarkEligibility = retentionEligibility + `
	AND NOT EXISTS (SELECT 1 FROM events q WHERE q.purge_started_at IS NOT NULL)`

type retentionSelection struct {
	query     string
	table     string
	lockAlias string
	match     string
	args      []any
}

func (s *Store) RetentionClock(ctx context.Context) (time.Time, error) {
	// Fail before even expired-key cleanup if retention migrations are absent.
	// LIMIT 0 validates the schema without scanning or changing event data.
	if _, err := s.pool.Exec(ctx, `SELECT purge_started_at FROM events LIMIT 0`); err != nil {
		return time.Time{}, fmt.Errorf("retention schema unavailable; apply migrations first: %w", err)
	}
	if _, err := s.pool.Exec(ctx, `SELECT deletion_requested_at FROM projects LIMIT 0`); err != nil {
		return time.Time{}, fmt.Errorf("project deletion schema unavailable; apply migrations first: %w", err)
	}
	var now time.Time
	if err := s.pool.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&now); err != nil {
		return time.Time{}, fmt.Errorf("read cleanup database time: %w", err)
	}
	return now, nil
}

// PreviewRetentionBatch returns a capped candidate count for one phase. It does
// not simulate later phases or promise that a concurrent run will see the same
// rows. The transaction is read-only and never takes cleanup/project row locks.
func (s *Store) PreviewRetentionBatch(ctx context.Context, batch retention.Batch) (int64, error) {
	if err := batch.Validate(); err != nil {
		return 0, err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return 0, fmt.Errorf("begin retention preview: %w", err)
	}
	defer rollbackTransaction(tx)
	if _, err := tx.Exec(ctx, `SELECT set_config('statement_timeout', '10s', true)`); err != nil {
		return 0, fmt.Errorf("bound retention preview: %w", err)
	}
	if batch.Phase == retention.DeleteProjects {
		return cleanupProjectData(
			ctx,
			tx,
			batch.Limit,
			true,
		)
	}
	selection := retentionCandidates(batch)
	var count int64
	err = tx.QueryRow(ctx, `SELECT count(*) FROM (`+selection.query+`) candidates`, selection.args...).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("preview retention candidates: %w", err)
	}
	return count, nil
}

// Every phase commits separately. No transaction deletes child rows and then
// acquires parent project locks, which would invert publisher/replay ordering.
func (s *Store) CleanupRetentionBatch(ctx context.Context, batch retention.Batch) (retention.BatchResult, error) {
	if err := batch.Validate(); err != nil {
		return retention.BatchResult{}, err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return retention.BatchResult{}, fmt.Errorf("begin retention batch: %w", err)
	}
	defer rollbackTransaction(tx)
	if _, err := tx.Exec(ctx, `SELECT set_config('statement_timeout', '10s', true)`); err != nil {
		return retention.BatchResult{}, fmt.Errorf("bound retention batch: %w", err)
	}
	var acquired bool
	if err := tx.QueryRow(ctx, `SELECT pg_try_advisory_xact_lock($1)`, retentionBatchLock).Scan(&acquired); err != nil {
		return retention.BatchResult{}, fmt.Errorf("coordinate retention batch: %w", err)
	}
	if !acquired {
		return retention.BatchResult{Busy: true}, nil
	}
	var affected int64
	switch batch.Phase {
	case retention.MarkEvents:
		affected, err = retireEventGroups(ctx, tx, batch)
	case retention.DeleteProjects:
		affected, err = cleanupProjectData(
			ctx,
			tx,
			batch.Limit,
			false,
		)
	default:
		selection := retentionCandidates(batch)
		// Table, aliases, joins, and matching keys come only from the fixed
		// phase allowlist below. All time boundaries and limits are bound.
		query := `WITH candidates AS (` + selection.query + ` FOR UPDATE OF ` + selection.lockAlias + ` SKIP LOCKED)
			DELETE FROM ` + selection.table + ` t USING candidates c WHERE ` + selection.match
		result, execErr := tx.Exec(ctx, query, selection.args...)
		err = execErr
		affected = result.RowsAffected()
	}
	if err != nil {
		return retention.BatchResult{}, fmt.Errorf("execute retention batch: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return retention.BatchResult{}, fmt.Errorf("commit retention batch; next run will resume persisted progress: %w", err)
	}
	return retention.BatchResult{Rows: affected}, nil
}

func retireEventGroups(ctx context.Context, tx pgx.Tx, batch retention.Batch) (int64, error) {
	// Replay, publication, dispatch intent, and endpoint mutation all take
	// the project lock before child rows. Skip busy parents in that order.
	rows, err := tx.Query(
		ctx,
		`SELECT p.id FROM projects p WHERE EXISTS (
		SELECT 1 FROM events e WHERE e.project_id = p.id AND `+retentionMarkEligibility+`)
		ORDER BY p.id LIMIT $3 FOR UPDATE OF p SKIP LOCKED`,
		batch.Cutoff,
		batch.Reference,
		batch.Limit,
	)
	if err != nil {
		return 0, fmt.Errorf("lock retention projects: %w", err)
	}
	projects, err := pgx.CollectRows(rows, pgx.RowTo[pgtype.UUID])
	if err != nil {
		return 0, fmt.Errorf("read retention projects: %w", err)
	}
	if len(projects) == 0 {
		return 0, nil
	}
	// READ COMMITTED gives this statement a fresh snapshot after parent
	// locks. A replay committed before the lock now fails the age/state test;
	// one waiting behind us will see the retired event and return not_found.
	result, err := tx.Exec(
		ctx,
		`WITH candidates AS (
		SELECT e.id FROM events e WHERE `+retentionMarkEligibility+`
		AND e.project_id = ANY($4::uuid[]) ORDER BY e.created_at, e.id LIMIT $3 FOR UPDATE OF e SKIP LOCKED)
		UPDATE events e SET purge_started_at = clock_timestamp() FROM candidates c
		WHERE e.id = c.id AND e.purge_started_at IS NULL`,
		batch.Cutoff,
		batch.Reference,
		batch.Limit,
		projects,
	)
	if err != nil {
		return 0, fmt.Errorf("retire eligible event groups: %w", err)
	}
	return result.RowsAffected(), nil
}

func retentionCandidates(batch retention.Batch) retentionSelection {
	switch batch.Phase {
	case retention.ExpireKeys:
		return retentionSelection{
			query: `SELECT k.project_id, k.idempotency_key FROM event_idempotency_keys k
				WHERE k.expires_at <= $1 ORDER BY k.expires_at, k.project_id, k.idempotency_key LIMIT $2`,
			table: "event_idempotency_keys", lockAlias: "k",
			match: `t.project_id = c.project_id AND t.idempotency_key = c.idempotency_key`,
			args:  []any{batch.Reference, batch.Limit},
		}
	case retention.MarkEvents:
		return retentionSelection{
			query: `SELECT e.id FROM events e WHERE ` + retentionMarkEligibility + ` ORDER BY e.created_at, e.id LIMIT $3`,
			args:  []any{batch.Cutoff, batch.Reference, batch.Limit},
		}
	case retention.DeleteAttempts:
		return retentionSelection{
			query: `SELECT a.id FROM delivery_attempts a
				JOIN deliveries d ON d.project_id = a.project_id AND d.id = a.delivery_id
				JOIN events e ON e.project_id = d.project_id AND e.id = d.event_id
				WHERE e.purge_started_at IS NOT NULL ORDER BY a.id LIMIT $1`,
			table: "delivery_attempts", lockAlias: "a", match: `t.id = c.id`, args: []any{batch.Limit},
		}
	case retention.DeleteReplays:
		return retentionSelection{
			query: `SELECT r.id FROM delivery_replays r
				JOIN deliveries d ON d.project_id = r.project_id AND d.id = r.delivery_id
				JOIN events e ON e.project_id = d.project_id AND e.id = d.event_id
				WHERE e.purge_started_at IS NOT NULL ORDER BY r.id LIMIT $1`,
			table: "delivery_replays", lockAlias: "r", match: `t.id = c.id`, args: []any{batch.Limit},
		}
	case retention.DeleteDeliveries:
		return retentionSelection{
			query: `SELECT d.id FROM deliveries d JOIN events e ON e.project_id = d.project_id AND e.id = d.event_id
				WHERE e.purge_started_at IS NOT NULL AND d.state IN ('succeeded', 'failed', 'canceled')
				AND NOT EXISTS (SELECT 1 FROM delivery_attempts a WHERE a.delivery_id = d.id)
				AND NOT EXISTS (SELECT 1 FROM delivery_replays r WHERE r.delivery_id = d.id)
				ORDER BY d.id LIMIT $1`,
			table: "deliveries", lockAlias: "d", match: `t.id = c.id`, args: []any{batch.Limit},
		}
	case retention.DeleteEvents:
		// delivery children must already be gone. The schema's unique event_id
		// on idempotency mappings bounds the remaining cascade to at most one
		// expired key per event, rather than an unbounded delivery history.
		return retentionSelection{
			query: `SELECT e.id FROM events e WHERE e.purge_started_at IS NOT NULL
				AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.event_id = e.id)
				AND NOT EXISTS (SELECT 1 FROM event_idempotency_keys k WHERE k.event_id = e.id AND k.expires_at > $1)
				ORDER BY e.purge_started_at, e.id LIMIT $2`,
			table: "events", lockAlias: "e", match: `t.id = c.id`, args: []any{batch.Reference, batch.Limit},
		}
	default:
		// Entry points validate the phase before reaching this fixed allowlist.
		panic("unvalidated retention phase")
	}
}
