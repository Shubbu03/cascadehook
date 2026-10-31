package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const projectDeletionEligibility = `p.deletion_requested_at IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.project_id = p.id
		AND d.state = 'leased' AND d.lease_expires_at > statement_timestamp())`

type projectCleanupSelection struct {
	retentionSelection
	detachRotation bool
}

// The janitor's shared advisory lock coordinates this work with history
// retention. Each call changes at most limit rows in one table of one project.
func cleanupProjectData(ctx context.Context, tx pgx.Tx, limit int, preview bool) (int64, error) {
	query := `SELECT p.id FROM projects p WHERE ` + projectDeletionEligibility + `
		ORDER BY p.deletion_requested_at, p.id LIMIT 1`
	if !preview {
		query += ` FOR UPDATE OF p SKIP LOCKED`
	}
	var projectID uuid.UUID
	err := tx.QueryRow(ctx, query).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("select requested project deletion: %w", err)
	}
	// A claim can commit after the selection's snapshot but before our parent
	// lock is acquired. Recheck with a fresh statement while holding that lock.
	var ready bool
	if err := tx.QueryRow(ctx, `SELECT `+projectDeletionEligibility+` FROM projects p WHERE p.id = $1`,
		projectID).Scan(&ready); err != nil {
		return 0, fmt.Errorf("check project deletion leases: %w", err)
	}
	if !ready {
		return 0, nil
	}
	for _, selection := range projectCleanupSelections(projectID, limit) {
		if preview {
			var count int64
			err := tx.QueryRow(ctx, `SELECT count(*) FROM (`+selection.query+`) candidates`,
				selection.args...).Scan(&count)
			if err != nil {
				return 0, fmt.Errorf("preview project cleanup: %w", err)
			}
			if count > 0 {
				return count, nil
			}
			continue
		}
		if selection.table == "events" {
			count, err := deleteEventsWithStorage(ctx, tx, selection.retentionSelection)
			if err != nil || count > 0 {
				return count, err
			}
			continue
		}
		// Table, keys, and aliases are fixed below; project/limit are bound.
		query := `WITH candidates AS (` + selection.query + ` FOR UPDATE OF ` + selection.lockAlias + ` SKIP LOCKED) `
		if selection.detachRotation {
			// Remove self-referencing rotation edges before deleting key batches.
			// Both columns must change together to preserve the pair constraint.
			query += `UPDATE api_keys t SET rotated_to_id = NULL, revokes_at = NULL FROM candidates c WHERE ` + selection.match
		} else {
			query += `DELETE FROM ` + selection.table + ` t USING candidates c WHERE ` + selection.match
		}
		result, err := tx.Exec(ctx, query, selection.args...)
		if err != nil {
			return 0, fmt.Errorf("purge project %s rows: %w", selection.table, err)
		}
		if result.RowsAffected() > 0 {
			return result.RowsAffected(), nil
		}
	}
	return 0, nil
}

func projectCleanupSelections(projectID uuid.UUID, limit int) []projectCleanupSelection {
	args := []any{projectID, limit}
	return append(projectNotificationCleanup(projectID, limit), []projectCleanupSelection{
		{retentionSelection: retentionSelection{
			query: `SELECT u.project_id, u.period FROM project_usage_months u WHERE u.project_id = $1
				ORDER BY u.period LIMIT $2`,
			table: "project_usage_months", lockAlias: "u", match: `t.project_id = c.project_id AND t.period = c.period`,
			args: args,
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT a.id FROM delivery_attempts a WHERE a.project_id = $1
				ORDER BY a.delivery_id, a.cycle, a.attempt_number LIMIT $2`,
			table: "delivery_attempts", lockAlias: "a", match: `t.id = c.id`, args: args,
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT r.id FROM delivery_replays r WHERE r.project_id = $1 ORDER BY r.id LIMIT $2`,
			table: "delivery_replays", lockAlias: "r", match: `t.id = c.id`, args: args,
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT k.project_id, k.idempotency_key FROM event_idempotency_keys k
				WHERE k.project_id = $1 ORDER BY k.idempotency_key LIMIT $2`,
			table: "event_idempotency_keys", lockAlias: "k",
			match: `t.project_id = c.project_id AND t.idempotency_key = c.idempotency_key`, args: args,
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT d.id FROM deliveries d WHERE d.project_id = $1
				AND NOT EXISTS (SELECT 1 FROM delivery_attempts a WHERE a.delivery_id = d.id)
				AND NOT EXISTS (SELECT 1 FROM delivery_replays r WHERE r.delivery_id = d.id)
				ORDER BY d.created_at, d.id LIMIT $2`,
			table: "deliveries", lockAlias: "d", match: `t.id = c.id`, args: args,
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT e.id FROM events e WHERE e.project_id = $1
				AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.event_id = e.id)
				AND NOT EXISTS (SELECT 1 FROM event_idempotency_keys k WHERE k.event_id = e.id)
				ORDER BY e.created_at, e.id LIMIT $2`,
			table: "events", lockAlias: "e", match: `t.id = c.id`, args: args,
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT s.endpoint_id, s.event_type FROM endpoint_subscriptions s
				JOIN endpoints e ON e.id = s.endpoint_id WHERE e.project_id = $1
				ORDER BY s.endpoint_id, s.event_type LIMIT $2`,
			table: "endpoint_subscriptions", lockAlias: "s",
			match: `t.endpoint_id = c.endpoint_id AND t.event_type = c.event_type`, args: args,
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT e.id FROM endpoints e WHERE e.project_id = $1
				AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.project_id = e.project_id AND d.endpoint_id = e.id)
				AND NOT EXISTS (SELECT 1 FROM endpoint_subscriptions s WHERE s.endpoint_id = e.id)
				ORDER BY e.id LIMIT $2`,
			table: "endpoints", lockAlias: "e", match: `t.id = c.id`, args: args,
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT k.id FROM api_keys k WHERE k.project_id = $1 AND k.rotated_to_id IS NOT NULL
				ORDER BY k.created_at, k.id LIMIT $2`,
			table: "api_keys", lockAlias: "k", match: `t.id = c.id`, args: args,
		}, detachRotation: true},
		{retentionSelection: retentionSelection{
			query: `SELECT k.id FROM api_keys k WHERE k.project_id = $1
				AND NOT EXISTS (SELECT 1 FROM api_keys r WHERE r.project_id = $1 AND r.rotated_to_id IS NOT NULL)
				ORDER BY k.created_at, k.id LIMIT $2`,
			table: "api_keys", lockAlias: "k", match: `t.id = c.id`, args: args,
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT a.id FROM project_control_actions a WHERE a.project_id = $1
				ORDER BY a.control_version LIMIT $2`,
			table: "project_control_actions", lockAlias: "a", match: `t.id = c.id`, args: args,
		}},
		{retentionSelection: retentionSelection{
			// All unbounded children must already be gone. Only the single
			// per-project request budget may remain for the final cascade.
			query: `SELECT p.id FROM projects p WHERE p.id = $1 AND p.deletion_requested_at IS NOT NULL
				AND NOT EXISTS (SELECT 1 FROM events e WHERE e.project_id = p.id)
				AND NOT EXISTS (SELECT 1 FROM endpoints e WHERE e.project_id = p.id)
				AND NOT EXISTS (SELECT 1 FROM api_keys k WHERE k.project_id = p.id)
				AND NOT EXISTS (SELECT 1 FROM project_usage_months u WHERE u.project_id = p.id)
				AND NOT EXISTS (SELECT 1 FROM project_control_actions a WHERE a.project_id = p.id)
				AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.project_id = p.id)
				AND NOT EXISTS (SELECT 1 FROM notification_delivery_state s WHERE s.project_id = p.id) LIMIT $2`,
			table: "projects", lockAlias: "p", match: `t.id = c.id`, args: args,
		}},
	}...)
}
