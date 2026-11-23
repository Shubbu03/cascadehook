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

func (s *Store) NotificationPreferences(ctx context.Context, userID uuid.UUID) (notifications.Preferences, error) {
	preferences := notifications.DefaultPreferences()
	err := s.pool.QueryRow(ctx, `SELECT email_enabled,email_categories,email_severities FROM notification_preferences WHERE user_id=$1`,
		userID).Scan(&preferences.EmailEnabled, &preferences.EmailCategories, &preferences.EmailSeverities)
	if errors.Is(err, pgx.ErrNoRows) {
		return notifications.DefaultPreferences(), nil
	}
	if err != nil {
		return notifications.Preferences{}, fmt.Errorf("read notification preferences: %w", err)
	}
	return preferences, nil
}

func (s *Store) SaveNotificationPreferences(
	ctx context.Context,
	userID uuid.UUID,
	preferences notifications.Preferences,
) error {
	if preferences.EmailSeverities == nil {
		preferences.EmailSeverities = notifications.DefaultPreferences().EmailSeverities
	}
	if !preferences.Valid() {
		return fmt.Errorf("invalid notification preferences")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin notification preferences update: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockActiveUsers(ctx, tx, userID); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO notification_preferences(user_id,email_enabled,email_categories,email_severities) VALUES($1,$2,$3,$4)
		ON CONFLICT(user_id) DO UPDATE SET email_enabled=EXCLUDED.email_enabled,email_categories=EXCLUDED.email_categories,email_severities=EXCLUDED.email_severities`,
		userID, preferences.EmailEnabled, preferences.EmailCategories, preferences.EmailSeverities)
	if err != nil {
		return fmt.Errorf("save notification preferences: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit notification preferences update: %w", err)
	}
	return nil
}

func (s *Store) ProjectNotificationPreferences(
	ctx context.Context,
	userID, projectID uuid.UUID,
) (notifications.ProjectPreferences, error) {
	if _, err := s.GetProject(ctx, userID, projectID); err != nil {
		return notifications.ProjectPreferences{}, err
	}
	preferences := notifications.ProjectPreferences{EmailEnabled: true}
	err := s.pool.QueryRow(ctx, `SELECT email_enabled FROM project_notification_preferences
		WHERE user_id=$1 AND project_id=$2`, userID, projectID).Scan(&preferences.EmailEnabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return notifications.ProjectPreferences{EmailEnabled: true}, nil
	}
	if err != nil {
		return notifications.ProjectPreferences{}, fmt.Errorf("read project notification preferences: %w", err)
	}
	return preferences, nil
}

func (s *Store) SaveProjectNotificationPreferences(
	ctx context.Context,
	userID, projectID uuid.UUID,
	preferences notifications.ProjectPreferences,
) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin project notification preferences update: %w", err)
	}
	defer rollbackTransaction(tx)
	var organizationID uuid.UUID
	err = tx.QueryRow(ctx, `SELECT organization_id FROM projects WHERE id=$1`, projectID).Scan(&organizationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("find notification preference organization: %w", err)
	}
	if err := lockNotificationOrganization(ctx, tx, userID, organizationID); err != nil {
		return err
	}
	var id uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM projects WHERE id=$1 AND deletion_requested_at IS NULL FOR SHARE`,
		projectID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("lock notification preference project: %w", err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO project_notification_preferences(user_id,project_id,email_enabled) VALUES($1,$2,$3)
		ON CONFLICT(user_id,project_id) DO UPDATE SET email_enabled=EXCLUDED.email_enabled`,
		userID, projectID, preferences.EmailEnabled)
	if err != nil {
		return fmt.Errorf("save project notification preferences: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit project notification preferences update: %w", err)
	}
	return nil
}
