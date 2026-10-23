package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/accounts"
	"cascadehook/internal/auth"
)

// Deletion requires an organization owner session. The parent lock fences
// resource/attempt writes; physical removal is left to the janitor.
func (s *Store) RequestProjectDeletion(
	ctx context.Context,
	userID uuid.UUID,
	projectID uuid.UUID,
) (accounts.ProjectDeletion, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return accounts.ProjectDeletion{}, fmt.Errorf("begin project deletion request: %w", err)
	}
	defer rollbackTransaction(tx)
	role, err := lockHumanProjectAccess(
		ctx,
		tx,
		auth.Principal{ProjectID: projectID, UserID: userID},
	)
	if err != nil {
		return accounts.ProjectDeletion{}, err
	}
	if role != accounts.Owner {
		return accounts.ProjectDeletion{}, accounts.ErrForbidden
	}
	var requestedAt *time.Time
	err = tx.QueryRow(ctx, `SELECT deletion_requested_at FROM projects WHERE id = $1 FOR UPDATE`,
		projectID).Scan(&requestedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.ProjectDeletion{}, accounts.ErrNotFound
	}
	if err != nil {
		return accounts.ProjectDeletion{}, fmt.Errorf("lock project deletion request: %w", err)
	}
	if requestedAt == nil {
		var at time.Time
		err = tx.QueryRow(
			ctx,
			`UPDATE projects SET deletion_requested_at = clock_timestamp(),
			deletion_requested_by_user_id = $2, updated_at = clock_timestamp()
			WHERE id = $1 RETURNING deletion_requested_at`,
			projectID,
			userID,
		).Scan(&at)
		if err != nil {
			return accounts.ProjectDeletion{}, fmt.Errorf("request project deletion: %w", err)
		}
		requestedAt = &at
	}
	if err := tx.Commit(ctx); err != nil {
		return accounts.ProjectDeletion{}, fmt.Errorf("commit project deletion request; retry to resolve acceptance: %w", err)
	}
	return accounts.ProjectDeletion{ProjectID: projectID, RequestedAt: *requestedAt}, nil
}
