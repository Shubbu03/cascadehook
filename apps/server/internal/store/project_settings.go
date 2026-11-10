package store

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/accounts"
	"cascadehook/internal/auth"
	"cascadehook/internal/deliveries"
)

func (s *Store) SaveProjectDetails(ctx context.Context, userID, projectID uuid.UUID, details accounts.ProjectDetails) error {
	if !details.Valid() {
		return accounts.ErrInvalidProjectDetails
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin project details update: %w", err)
	}
	defer rollbackTransaction(tx)
	if _, err := lockHumanProjectAccess(ctx, tx, auth.Principal{ProjectID: projectID, UserID: userID}); err != nil {
		return err
	}
	result, err := tx.Exec(ctx, `UPDATE projects SET description=$2,environment=$3,updated_at=clock_timestamp()
		WHERE id=$1 AND deletion_requested_at IS NULL`, projectID, strings.TrimSpace(details.Description), details.Environment)
	if err != nil {
		return fmt.Errorf("update project details: %w", err)
	}
	if result.RowsAffected() != 1 {
		return accounts.ErrNotFound
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit project details update: %w", err)
	}
	return nil
}

func (s *Store) DeliveryPolicy(ctx context.Context, userID, projectID uuid.UUID) (deliveries.Policy, error) {
	if _, err := s.GetProject(ctx, userID, projectID); err != nil {
		return deliveries.Policy{}, err
	}
	return readDeliveryPolicy(ctx, s.pool, projectID)
}

type policyReader interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func readDeliveryPolicy(ctx context.Context, db policyReader, projectID uuid.UUID) (deliveries.Policy, error) {
	policy := deliveries.DefaultPolicy()
	err := db.QueryRow(ctx, `SELECT max_attempts,timeout_seconds,retry_delays_seconds
		FROM project_delivery_policies WHERE project_id=$1`, projectID).Scan(
		&policy.MaxAttempts, &policy.TimeoutSeconds, &policy.RetryDelaysSeconds)
	if errors.Is(err, pgx.ErrNoRows) {
		return deliveries.DefaultPolicy(), nil
	}
	if err != nil {
		return deliveries.Policy{}, fmt.Errorf("read delivery policy: %w", err)
	}
	return policy, nil
}

func (s *Store) SaveDeliveryPolicy(ctx context.Context, userID, projectID uuid.UUID, policy deliveries.Policy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin delivery policy update: %w", err)
	}
	defer rollbackTransaction(tx)
	if _, err := lockHumanProjectAccess(ctx, tx, auth.Principal{ProjectID: projectID, UserID: userID}); err != nil {
		return err
	}
	var id uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM projects WHERE id=$1 AND deletion_requested_at IS NULL FOR UPDATE`, projectID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("lock project for delivery policy: %w", err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO project_delivery_policies(project_id,max_attempts,timeout_seconds,retry_delays_seconds)
		VALUES($1,$2,$3,$4) ON CONFLICT(project_id) DO UPDATE SET max_attempts=EXCLUDED.max_attempts,
		timeout_seconds=EXCLUDED.timeout_seconds,retry_delays_seconds=EXCLUDED.retry_delays_seconds`,
		projectID, policy.MaxAttempts, policy.TimeoutSeconds, policy.RetryDelaysSeconds)
	if err != nil {
		return fmt.Errorf("save delivery policy: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit delivery policy update: %w", err)
	}
	return nil
}
