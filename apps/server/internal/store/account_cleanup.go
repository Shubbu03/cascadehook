package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func cleanupOrganizationData(ctx context.Context, tx pgx.Tx, limit int, preview bool) (int64, error) {
	query := `SELECT o.id FROM organizations o WHERE o.deletion_requested_at IS NOT NULL
		AND (EXISTS (SELECT 1 FROM projects p WHERE p.organization_id = o.id AND p.deletion_requested_at IS NULL)
			OR NOT EXISTS (SELECT 1 FROM projects p WHERE p.organization_id = o.id))
		ORDER BY o.deletion_requested_at, o.id LIMIT 1`
	if !preview {
		query += ` FOR UPDATE OF o SKIP LOCKED`
	}
	var id uuid.UUID
	err := tx.QueryRow(ctx, query).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("select organization cleanup: %w", err)
	}
	selections := append(organizationNotificationCleanup(id, limit), []lifecycleCleanupSelection{
		{retentionSelection: retentionSelection{
			query: `SELECT i.id FROM organization_invitations i WHERE i.organization_id = $1 ORDER BY i.id LIMIT $2`,
			table: "organization_invitations", lockAlias: "i", match: `t.id = c.id`, args: []any{id, limit},
		}},
		{
			retentionSelection: retentionSelection{
				query: `SELECT p.id FROM projects p WHERE p.organization_id = $1
					AND p.deletion_requested_at IS NULL ORDER BY p.id LIMIT $2`,
				table: "projects", lockAlias: "p", match: `t.id = c.id`, args: []any{id, limit},
			},
			update: `UPDATE projects t SET deletion_requested_at = o.deletion_requested_at,
				deletion_requested_by_user_id = o.deletion_requested_by_user_id, updated_at = clock_timestamp()
				FROM candidates c, organizations o WHERE o.id = $1 AND t.id = c.id`,
		},
		{retentionSelection: retentionSelection{
			query: `SELECT m.organization_id, m.user_id FROM memberships m WHERE m.organization_id = $1
				AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.organization_id = $1)
				ORDER BY m.user_id LIMIT $2`,
			table: "memberships", lockAlias: "m",
			match: `t.organization_id = c.organization_id AND t.user_id = c.user_id`, args: []any{id, limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT a.id FROM organization_ownership_actions a WHERE a.organization_id = $1
				AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.organization_id = $1) ORDER BY a.id LIMIT $2`,
			table: "organization_ownership_actions", lockAlias: "a", match: `t.id = c.id`, args: []any{id, limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT u.organization_id, u.period FROM organization_usage_months u WHERE u.organization_id = $1
				AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.organization_id = $1) ORDER BY u.period LIMIT $2`,
			table: "organization_usage_months", lockAlias: "u",
			match: `t.organization_id = c.organization_id AND t.period = c.period`, args: []any{id, limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT a.id FROM organization_quota_actions a WHERE a.organization_id = $1
				AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.organization_id = $1) ORDER BY a.id LIMIT $2`,
			table: "organization_quota_actions", lockAlias: "a", match: `t.id = c.id`, args: []any{id, limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT o.id FROM organizations o WHERE o.id = $1 AND o.deletion_requested_at IS NOT NULL
				AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.organization_id = o.id)
				AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = o.id)
				AND NOT EXISTS (SELECT 1 FROM organization_invitations i WHERE i.organization_id = o.id)
				AND NOT EXISTS (SELECT 1 FROM organization_usage_months u WHERE u.organization_id = o.id)
				AND NOT EXISTS (SELECT 1 FROM organization_ownership_actions a WHERE a.organization_id = o.id)
				AND NOT EXISTS (SELECT 1 FROM organization_quota_actions a WHERE a.organization_id = o.id)
				AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.organization_id = o.id)
				AND NOT EXISTS (SELECT 1 FROM notification_recipients r WHERE r.organization_id = o.id)
				AND NOT EXISTS (SELECT 1 FROM notification_delivery_state s WHERE s.organization_id = o.id) LIMIT $2`,
			table: "organizations", lockAlias: "o", match: `t.id = c.id`, args: []any{id, limit},
		}},
	}...)
	return cleanupLifecycleSelections(
		ctx,
		tx,
		selections,
		preview,
	)
}

func cleanupAccountData(ctx context.Context, tx pgx.Tx, limit int, preview bool) (int64, error) {
	// Local deletion cannot begin while owning an active organization. Keep
	// this condition during cleanup too, even if state was changed out of band.
	query := `SELECT u.id FROM users u WHERE u.deletion_requested_at IS NOT NULL
		AND (u.provider_deleted_at IS NOT NULL OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id))
		AND NOT EXISTS (SELECT 1 FROM memberships m JOIN organizations o ON o.id = m.organization_id
			WHERE m.user_id = u.id AND m.role = 'owner' AND o.deletion_requested_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM memberships other JOIN users active ON active.id = other.user_id
				WHERE other.organization_id = o.id AND other.role = 'owner' AND active.deletion_requested_at IS NULL))
		ORDER BY u.deletion_requested_at, u.id LIMIT 1`
	if !preview {
		query += ` FOR UPDATE OF u SKIP LOCKED`
	}
	var id uuid.UUID
	err := tx.QueryRow(ctx, query).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("select account cleanup: %w", err)
	}
	selections := []lifecycleCleanupSelection{
		{retentionSelection: retentionSelection{
			query: `SELECT r.notification_id,r.user_id FROM notification_recipients r WHERE r.user_id = $1
				ORDER BY r.notification_id LIMIT $2`,
			table: "notification_recipients", lockAlias: "r",
			match: `t.notification_id = c.notification_id AND t.user_id = c.user_id`, args: []any{id, limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT m.organization_id, m.user_id FROM memberships m WHERE m.user_id = $1
				ORDER BY m.organization_id LIMIT $2`,
			table: "memberships", lockAlias: "m",
			match: `t.organization_id = c.organization_id AND t.user_id = c.user_id`, args: []any{id, limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT u.id FROM users u WHERE u.id = $1 AND u.deletion_requested_at IS NOT NULL
				AND u.provider_deleted_at IS NOT NULL
				AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)
				AND NOT EXISTS (SELECT 1 FROM notification_recipients r WHERE r.user_id = u.id) LIMIT $2`,
			table: "users", lockAlias: "u", match: `t.id = c.id`, args: []any{id, limit},
		}},
	}
	return cleanupLifecycleSelections(
		ctx,
		tx,
		selections,
		preview,
	)
}

type lifecycleCleanupSelection struct {
	retentionSelection
	update string
}

func cleanupLifecycleSelections(
	ctx context.Context,
	tx pgx.Tx,
	selections []lifecycleCleanupSelection,
	preview bool,
) (int64, error) {
	for _, selection := range selections {
		if preview {
			var count int64
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM (`+selection.query+`) candidates`,
				selection.args...).Scan(&count); err != nil {
				return 0, fmt.Errorf("preview lifecycle cleanup: %w", err)
			}
			if count > 0 {
				return count, nil
			}
			continue
		}
		// Every statement fragment is a fixed local allowlist; values are bound.
		query := `WITH candidates AS (` + selection.query + ` FOR UPDATE OF ` + selection.lockAlias + ` SKIP LOCKED) `
		if selection.update != "" {
			query += selection.update
		} else {
			query += `DELETE FROM ` + selection.table + ` t USING candidates c WHERE ` + selection.match
		}
		result, err := tx.Exec(ctx, query, selection.args...)
		if err != nil {
			return 0, fmt.Errorf("execute lifecycle cleanup: %w", err)
		}
		if result.RowsAffected() > 0 {
			return result.RowsAffected(), nil
		}
	}
	return 0, nil
}
