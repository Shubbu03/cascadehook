package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/controls"
	"cascadehook/internal/notifications"
)

// GenerateKeyExpiryNotifications selects only outstanding current thresholds.
// Database uniqueness deduplicates competing workers and ambiguous commits.
func (s *Store) GenerateKeyExpiryNotifications(ctx context.Context, limit int) (int, error) {
	if limit < 1 || limit > 100 {
		return 0, fmt.Errorf("notification maintenance batch must contain 1 to 100 keys")
	}
	rows, err := s.pool.Query(ctx, `SELECT k.id,k.project_id FROM api_keys k
		JOIN projects p ON p.id = k.project_id JOIN organizations o ON o.id = p.organization_id
		WHERE k.revoked_at IS NULL AND k.revokes_at IS NULL AND k.expires_at > clock_timestamp()
		AND k.expires_at <= clock_timestamp() + interval '7 days'
		AND p.deletion_requested_at IS NULL AND o.deletion_requested_at IS NULL
		AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.organization_id = o.id AND n.source_key =
			'key:' || k.id::text || ':expiry:' || CASE WHEN k.expires_at <= clock_timestamp() + interval '1 day' THEN '1d' ELSE '7d' END)
		ORDER BY k.expires_at,k.id LIMIT $1`, limit)
	if err != nil {
		return 0, fmt.Errorf("select expiring notification keys: %w", err)
	}
	type candidate struct{ ID, ProjectID uuid.UUID }
	keys, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (candidate, error) {
		var key candidate
		err := row.Scan(&key.ID, &key.ProjectID)
		return key, err
	})
	if err != nil {
		return 0, fmt.Errorf("read expiring notification keys: %w", err)
	}
	created := 0
	for _, key := range keys {
		if err := ctx.Err(); err != nil {
			return created, err
		}
		changed, err := s.notifyKeyExpiry(ctx, key.ProjectID, key.ID)
		if err != nil {
			return created, err
		}
		if changed {
			created++
		}
	}
	return created, nil
}

func (s *Store) notifyKeyExpiry(ctx context.Context, projectID, keyID uuid.UUID) (bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("begin key expiry notification: %w", err)
	}
	defer rollbackTransaction(tx)
	err = lockProjectOrganization(ctx, tx, projectID)
	if errors.Is(err, controls.ErrProjectNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	var id uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM projects WHERE id = $1 AND deletion_requested_at IS NULL FOR SHARE`, projectID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("lock expiry notification project: %w", err)
	}
	var expiresAt, now time.Time
	err = tx.QueryRow(ctx, `SELECT expires_at,clock_timestamp() FROM api_keys WHERE project_id = $1 AND id = $2
		AND revoked_at IS NULL AND revokes_at IS NULL AND expires_at > clock_timestamp()
		AND expires_at <= clock_timestamp() + interval '7 days' FOR SHARE`, projectID, keyID).Scan(&expiresAt, &now)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("lock expiring notification key: %w", err)
	}
	window := "7d"
	if !expiresAt.After(now.Add(24 * time.Hour)) {
		window = "1d"
	}
	id, err = emitNotification(ctx, tx, notificationEvent{
		ProjectID: projectID, Type: "api_key_expiring", Category: notifications.Credentials,
		Severity: "warning", Audience: "manager", Title: "An API key is approaching expiry",
		Body:         "A project API key expires on " + expiresAt.UTC().Format(time.RFC3339) + ". Replace it before applications lose access.",
		ResourceType: "api_key", ResourceID: keyID, SourceKey: "key:" + keyID.String() + ":expiry:" + window,
	})
	if err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("commit key expiry notification: %w", err)
	}
	return id != uuid.Nil, nil
}
