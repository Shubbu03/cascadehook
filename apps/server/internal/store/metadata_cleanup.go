package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

func cleanupMetadata(ctx context.Context, tx pgx.Tx, reference time.Time, limit int, preview bool) (int64, error) {
	selections := []lifecycleCleanupSelection{
		{retentionSelection: retentionSelection{
			query: `SELECT r.message_hash FROM identity_webhook_receipts r
				WHERE r.received_at < $1 ORDER BY r.received_at LIMIT $2`,
			table: "identity_webhook_receipts", lockAlias: "r", match: `t.message_hash = c.message_hash`,
			args: []any{reference.Add(-30 * 24 * time.Hour), limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT i.id FROM organization_invitations i WHERE i.expires_at < $1 ORDER BY i.expires_at LIMIT $2`,
			table: "organization_invitations", lockAlias: "i", match: `t.id = c.id`,
			args: []any{reference.Add(-30 * 24 * time.Hour), limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT s.endpoint_id,s.event_type FROM endpoint_subscriptions s JOIN endpoints e ON e.id = s.endpoint_id
				WHERE e.deleted_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.endpoint_id = e.id)
				ORDER BY e.id,s.event_type LIMIT $1`,
			table: "endpoint_subscriptions", lockAlias: "s",
			match: `t.endpoint_id = c.endpoint_id AND t.event_type = c.event_type`, args: []any{limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT s.endpoint_id FROM notification_delivery_state s JOIN endpoints e ON e.id = s.endpoint_id
				WHERE e.deleted_at IS NOT NULL ORDER BY s.endpoint_id LIMIT $1`,
			table: "notification_delivery_state", lockAlias: "s", match: `t.endpoint_id = c.endpoint_id`, args: []any{limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT e.id FROM endpoints e WHERE e.deleted_at IS NOT NULL
				AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.endpoint_id = e.id)
				AND NOT EXISTS (SELECT 1 FROM endpoint_subscriptions s WHERE s.endpoint_id = e.id)
				AND NOT EXISTS (SELECT 1 FROM notification_delivery_state s WHERE s.endpoint_id = e.id)
				ORDER BY e.id LIMIT $1`,
			table: "endpoints", lockAlias: "e", match: `t.id = c.id`, args: []any{limit},
		}},
		{retentionSelection: retentionSelection{
			query: `SELECT k.id FROM api_keys k WHERE k.created_at < $1 AND k.rotated_to_id IS NOT NULL
				AND k.revokes_at <= $2 ORDER BY k.created_at,k.id LIMIT $3`,
			table: "api_keys", lockAlias: "k", match: `t.id = c.id`,
			args: []any{reference.Add(-90 * 24 * time.Hour), reference, limit},
		}, update: `UPDATE api_keys t SET revoked_at = coalesce(t.revoked_at,t.revokes_at),
			rotated_to_id = NULL, revokes_at = NULL FROM candidates c WHERE t.id = c.id`},
		{retentionSelection: retentionSelection{
			query: `SELECT k.id FROM api_keys k WHERE k.created_at < $1 AND k.rotated_to_id IS NULL
				AND (k.revoked_at IS NOT NULL OR k.expires_at <= $2 OR k.revokes_at <= $2)
				AND NOT EXISTS (SELECT 1 FROM api_keys source WHERE source.rotated_to_id = k.id)
				ORDER BY k.created_at,k.id LIMIT $3`,
			table: "api_keys", lockAlias: "k", match: `t.id = c.id`,
			args: []any{reference.Add(-90 * 24 * time.Hour), reference, limit},
		}},
	}
	count, err := cleanupLifecycleSelections(
		ctx,
		tx,
		selections,
		preview,
	)
	if err != nil {
		return 0, fmt.Errorf("clean expired security metadata: %w", err)
	}
	return count, nil
}
