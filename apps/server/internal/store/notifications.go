package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/accounts"
	"cascadehook/internal/notifications"
)

const notificationColumns = `n.id,n.organization_id,n.project_id,n.type,n.category,n.severity,n.title,n.body,
	n.resource_type,CASE
		WHEN n.resource_type = 'endpoint' AND NOT EXISTS (SELECT 1 FROM endpoints e WHERE e.id = n.resource_id AND e.project_id = n.project_id AND e.deleted_at IS NULL) THEN NULL
		WHEN n.resource_type = 'api_key' AND NOT EXISTS (SELECT 1 FROM api_keys k WHERE k.id = n.resource_id AND k.project_id = n.project_id) THEN NULL
		ELSE n.resource_id END,
	n.actor_user_id,n.occurrence_count,n.resolved_at,n.created_at,r.read_at,r.archived_at`

const notificationJoins = ` FROM notification_recipients r
	JOIN notifications n ON n.id = r.notification_id AND n.organization_id = r.organization_id
	JOIN memberships m ON m.organization_id = r.organization_id AND m.user_id = r.user_id
		AND m.created_at = r.membership_created_at
	JOIN users u ON u.id = m.user_id
	JOIN organizations o ON o.id = m.organization_id
	LEFT JOIN projects p ON p.id = n.project_id AND p.organization_id = n.organization_id `

const notificationVisibility = `r.user_id = $1 AND r.organization_id = $2
	AND u.deletion_requested_at IS NULL AND o.deletion_requested_at IS NULL
	AND (n.project_id IS NULL OR (p.id IS NOT NULL AND p.deletion_requested_at IS NULL))
	AND (r.required_role = 'member' OR m.role = 'owner' OR (r.required_role = 'manager' AND m.role = 'admin'))`

func scanNotification(row pgx.Row) (notifications.Notification, error) {
	var item notifications.Notification
	err := row.Scan(&item.ID, &item.OrganizationID, &item.ProjectID, &item.Type, &item.Category,
		&item.Severity, &item.Title, &item.Body, &item.Target.Type, &item.Target.ID,
		&item.ActorUserID, &item.OccurrenceCount, &item.ResolvedAt, &item.CreatedAt, &item.ReadAt, &item.ArchivedAt)
	return item, err
}

// Every read rechecks membership generation and role, including badge counts.
func (s *Store) ListNotifications(ctx context.Context, userID, organizationID uuid.UUID, options notifications.ListOptions) ([]notifications.Notification, error) {
	if err := options.Options.Validate(); err != nil {
		return nil, err
	}
	if err := s.checkNotificationFilters(ctx, userID, organizationID, options.Filters); err != nil {
		return nil, err
	}
	query := `SELECT ` + notificationColumns + notificationJoins + ` WHERE ` + notificationVisibility
	args := []any{userID, organizationID}
	query = filterNotifications(query, &args, options.Filters)
	if options.Before != nil {
		args = append(args, options.Before.CreatedAt, options.Before.ID)
		query += fmt.Sprintf(` AND (n.created_at,n.id) < ($%d,$%d)`, len(args)-1, len(args))
	}
	args = append(args, options.Limit+1)
	query += fmt.Sprintf(` ORDER BY n.created_at DESC,n.id DESC LIMIT $%d`, len(args))
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list notifications: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (notifications.Notification, error) {
		return scanNotification(row)
	})
}

func (s *Store) NotificationUnreadCount(ctx context.Context, userID, organizationID uuid.UUID, filters notifications.Filters) (int64, error) {
	filters.State = notifications.Unread
	if err := s.checkNotificationFilters(ctx, userID, organizationID, filters); err != nil {
		return 0, err
	}
	query := `SELECT count(*)` + notificationJoins + ` WHERE ` + notificationVisibility
	args := []any{userID, organizationID}
	query = filterNotifications(query, &args, filters)
	var count int64
	if err := s.pool.QueryRow(ctx, query, args...).Scan(&count); err != nil {
		return 0, fmt.Errorf("count unread notifications: %w", err)
	}
	return count, nil
}

func (s *Store) UpdateNotification(ctx context.Context, userID, organizationID, id uuid.UUID, update notifications.Update) (notifications.Notification, error) {
	if update.Read == nil && update.Archived == nil {
		return notifications.Notification{}, fmt.Errorf("notification update is empty")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return notifications.Notification{}, fmt.Errorf("begin notification update: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockNotificationOrganization(ctx, tx, userID, organizationID); err != nil {
		return notifications.Notification{}, err
	}
	// Source membership changes take the exclusive organization lock. Keep the
	// access check and the personal state mutation in the same transaction.
	result, err := tx.Exec(ctx, `UPDATE notification_recipients recipient SET
		read_at = CASE WHEN $4::boolean IS NULL THEN recipient.read_at WHEN $4 THEN coalesce(recipient.read_at,clock_timestamp()) ELSE NULL END,
		archived_at = CASE WHEN $5::boolean IS NULL THEN recipient.archived_at WHEN $5 THEN coalesce(recipient.archived_at,clock_timestamp()) ELSE NULL END
		WHERE recipient.user_id = $1 AND recipient.organization_id = $2 AND recipient.notification_id = $3
		AND EXISTS (SELECT 1`+notificationJoins+` WHERE `+notificationVisibility+` AND n.id = $3)`,
		userID, organizationID, id, update.Read, update.Archived)
	if err != nil {
		return notifications.Notification{}, fmt.Errorf("update notification state: %w", err)
	}
	if result.RowsAffected() == 0 {
		return notifications.Notification{}, notifications.ErrNotFound
	}
	item, err := scanNotification(tx.QueryRow(ctx, `SELECT `+notificationColumns+notificationJoins+
		` WHERE `+notificationVisibility+` AND n.id = $3`, userID, organizationID, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notifications.Notification{}, notifications.ErrNotFound
		}
		return notifications.Notification{}, fmt.Errorf("read updated notification: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return notifications.Notification{}, fmt.Errorf("commit notification update: %w", err)
	}
	return item, nil
}

func (s *Store) ReadAllNotifications(ctx context.Context, userID, organizationID uuid.UUID, filters notifications.Filters) (int64, error) {
	filters.State = notifications.Unread
	if err := s.checkNotificationFilters(ctx, userID, organizationID, filters); err != nil {
		return 0, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin notification read-all: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockNotificationOrganization(ctx, tx, userID, organizationID); err != nil {
		return 0, err
	}
	query := `SELECT n.id` + notificationJoins + ` WHERE ` + notificationVisibility
	args := []any{userID, organizationID}
	query = filterNotifications(query, &args, filters)
	// One statement snapshot: uncommitted/new arrivals are not accidentally read.
	result, err := tx.Exec(ctx, `WITH visible AS (`+query+`)
		UPDATE notification_recipients r SET read_at = clock_timestamp()
		WHERE r.user_id = $1 AND r.organization_id = $2 AND r.read_at IS NULL
		AND r.notification_id IN (SELECT id FROM visible)`, args...)
	if err != nil {
		return 0, fmt.Errorf("mark notifications read: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit notification read-all: %w", err)
	}
	return result.RowsAffected(), nil
}

func (s *Store) checkNotificationFilters(ctx context.Context, userID, organizationID uuid.UUID, filters notifications.Filters) error {
	if !filters.Valid() {
		return fmt.Errorf("invalid notification filters")
	}
	if _, err := s.GetOrganization(ctx, userID, organizationID); err != nil {
		return err
	}
	if filters.ProjectID != nil {
		project, err := s.GetProject(ctx, userID, *filters.ProjectID)
		if err != nil {
			return err
		}
		if project.OrganizationID != organizationID {
			return accounts.ErrNotFound
		}
	}
	return nil
}

func lockNotificationOrganization(ctx context.Context, tx pgx.Tx, userID, organizationID uuid.UUID) error {
	if err := lockActiveUsers(ctx, tx, userID); err != nil {
		return err
	}
	var id uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM organizations WHERE id = $1
		AND deletion_requested_at IS NULL FOR SHARE`, organizationID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("lock notification organization: %w", err)
	}
	_, err = organizationRole(ctx, tx, userID, organizationID)
	return err
}

func filterNotifications(query string, args *[]any, filters notifications.Filters) string {
	switch filters.State {
	case notifications.Archived:
		query += ` AND r.archived_at IS NOT NULL`
	case notifications.Unread:
		query += ` AND r.archived_at IS NULL AND r.read_at IS NULL`
	case notifications.Read:
		query += ` AND r.archived_at IS NULL AND r.read_at IS NOT NULL`
	default:
		query += ` AND r.archived_at IS NULL`
	}
	if filters.ProjectID != nil {
		*args = append(*args, *filters.ProjectID)
		query += fmt.Sprintf(` AND n.project_id = $%d`, len(*args))
	}
	if filters.Category != "" {
		*args = append(*args, filters.Category)
		query += fmt.Sprintf(` AND n.category = $%d`, len(*args))
	}
	return query
}
