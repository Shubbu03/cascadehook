package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/accounts"
)

func (s *Store) HasPendingAccountDeletion(ctx context.Context) (bool, error) {
	var pending bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users
		WHERE deletion_requested_at IS NOT NULL AND provider_deleted_at IS NULL)`).Scan(&pending)
	if err != nil {
		return false, fmt.Errorf("check pending provider deletions: %w", err)
	}
	return pending, nil
}

func (s *Store) ClaimAccountDeletion(ctx context.Context, issuer string) (accounts.ProviderDeletion, error) {
	token, err := uuid.NewV7()
	if err != nil {
		return accounts.ProviderDeletion{}, fmt.Errorf("generate account deletion lease: %w", err)
	}
	var job accounts.ProviderDeletion
	err = s.pool.QueryRow(
		ctx,
		`WITH candidate AS (
		SELECT u.id FROM users u WHERE u.deletion_requested_at IS NOT NULL AND u.provider_deleted_at IS NULL
		AND u.identity_issuer = $1 AND u.provider_delete_after <= statement_timestamp()
		AND (u.provider_delete_token IS NULL OR u.provider_delete_lease_expires_at <= statement_timestamp())
		ORDER BY u.provider_delete_after, u.id LIMIT 1 FOR UPDATE OF u SKIP LOCKED
		) UPDATE users u SET provider_delete_token = $2,
		provider_delete_lease_expires_at = clock_timestamp() + interval '1 minute',
		provider_delete_attempts = least(provider_delete_attempts + 1, 1000000)
		FROM candidate c WHERE u.id = c.id
		RETURNING u.id, u.identity_issuer, u.identity_subject, u.provider_delete_token, u.provider_delete_attempts`,
		issuer,
		token,
	).Scan(&job.UserID, &job.Issuer, &job.Subject, &job.Token, &job.Attempt)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.ProviderDeletion{}, nil
	}
	if err != nil {
		return accounts.ProviderDeletion{}, fmt.Errorf("claim account provider deletion: %w", err)
	}
	return job, nil
}

func (s *Store) CompleteAccountDeletion(
	ctx context.Context,
	job accounts.ProviderDeletion,
	succeeded bool,
	retryDelay time.Duration,
) error {
	if job.UserID == uuid.Nil || job.Token == uuid.Nil || retryDelay < 0 || retryDelay > 24*time.Hour {
		return fmt.Errorf("invalid provider deletion completion")
	}
	result, err := s.pool.Exec(
		ctx,
		`UPDATE users SET provider_deleted_at = CASE WHEN $3 THEN clock_timestamp() ELSE NULL END,
		provider_delete_after = clock_timestamp() + $4::interval,
		provider_delete_token = NULL, provider_delete_lease_expires_at = NULL
		WHERE id = $1 AND provider_delete_token = $2 AND provider_delete_lease_expires_at > clock_timestamp()
		AND deletion_requested_at IS NOT NULL AND provider_deleted_at IS NULL`,
		job.UserID,
		job.Token,
		succeeded,
		deliveryInterval(retryDelay),
	)
	if err != nil {
		return fmt.Errorf("complete account provider deletion: %w", err)
	}
	if result.RowsAffected() != 1 {
		return accounts.ErrDeletionLeaseLost
	}
	return nil
}
