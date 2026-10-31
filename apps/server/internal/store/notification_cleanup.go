package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Child-first batches never cascade an unbounded inbox or member collection.
func cleanupNotifications(ctx context.Context, tx pgx.Tx, cutoff time.Time, limit int, preview bool) (int64, error) {
	selections := []lifecycleCleanupSelection{
		{retentionSelection: retentionSelection{
			query: `SELECT r.notification_id,r.user_id FROM notification_recipients r
				JOIN notifications n ON n.id = r.notification_id
				LEFT JOIN users u ON u.id = r.user_id
				LEFT JOIN memberships m ON m.organization_id = r.organization_id AND m.user_id = r.user_id
				WHERE n.created_at < $1 OR u.id IS NULL OR u.deletion_requested_at IS NOT NULL
				OR m.user_id IS NULL OR m.created_at <> r.membership_created_at
				ORDER BY r.notification_id,r.user_id LIMIT $2`,
			table: "notification_recipients", lockAlias: "r",
			match: `t.notification_id = c.notification_id AND t.user_id = c.user_id`, args: []any{cutoff, limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT n.id FROM notifications n WHERE n.created_at < $1
				AND NOT EXISTS (SELECT 1 FROM notification_recipients r WHERE r.notification_id = n.id)
				ORDER BY n.created_at,n.id LIMIT $2`,
			table: "notifications", lockAlias: "n", match: `t.id = c.id`, args: []any{cutoff, limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT s.endpoint_id FROM notification_delivery_state s JOIN endpoints e ON e.id = s.endpoint_id
				WHERE e.deleted_at IS NOT NULL OR s.recovered_at < $1 ORDER BY s.endpoint_id LIMIT $2`,
			table: "notification_delivery_state", lockAlias: "s", match: `t.endpoint_id = c.endpoint_id`, args: []any{cutoff, limit},
		}},
	}
	return cleanupLifecycleSelections(ctx, tx, selections, preview)
}

func organizationNotificationCleanup(id uuid.UUID, limit int) []lifecycleCleanupSelection {
	return []lifecycleCleanupSelection{
		{retentionSelection: retentionSelection{
			query: `SELECT r.notification_id,r.user_id FROM notification_recipients r
				WHERE r.organization_id = $1 ORDER BY r.notification_id,r.user_id LIMIT $2`,
			table: "notification_recipients", lockAlias: "r",
			match: `t.notification_id = c.notification_id AND t.user_id = c.user_id`, args: []any{id, limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT n.id FROM notifications n WHERE n.organization_id = $1
				AND NOT EXISTS (SELECT 1 FROM notification_recipients r WHERE r.notification_id = n.id)
				ORDER BY n.id LIMIT $2`,
			table: "notifications", lockAlias: "n", match: `t.id = c.id`, args: []any{id, limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT s.endpoint_id FROM notification_delivery_state s
				WHERE s.organization_id = $1 ORDER BY s.endpoint_id LIMIT $2`,
			table: "notification_delivery_state", lockAlias: "s", match: `t.endpoint_id = c.endpoint_id`, args: []any{id, limit},
		}},
	}
}

func projectNotificationCleanup(id uuid.UUID, limit int) []projectCleanupSelection {
	return []projectCleanupSelection{
		{retentionSelection: retentionSelection{
			query: `SELECT r.notification_id,r.user_id FROM notification_recipients r JOIN notifications n ON n.id = r.notification_id
				WHERE n.project_id = $1 ORDER BY r.notification_id,r.user_id LIMIT $2`,
			table: "notification_recipients", lockAlias: "r",
			match: `t.notification_id = c.notification_id AND t.user_id = c.user_id`, args: []any{id, limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT n.id FROM notifications n WHERE n.project_id = $1
				AND NOT EXISTS (SELECT 1 FROM notification_recipients r WHERE r.notification_id = n.id)
				ORDER BY n.id LIMIT $2`,
			table: "notifications", lockAlias: "n", match: `t.id = c.id`, args: []any{id, limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT s.endpoint_id FROM notification_delivery_state s WHERE s.project_id = $1 ORDER BY s.endpoint_id LIMIT $2`,
			table: "notification_delivery_state", lockAlias: "s", match: `t.endpoint_id = c.endpoint_id`, args: []any{id, limit},
		}},
	}
}
