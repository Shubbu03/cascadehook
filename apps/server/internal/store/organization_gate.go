package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/controls"
)

// Organization deletion takes the exclusive counterpart. This lock must come
// before project/child locks, including for workers and API-key callers.
func lockProjectOrganization(ctx context.Context, tx pgx.Tx, projectID uuid.UUID) error {
	var id uuid.UUID
	err := tx.QueryRow(ctx, `SELECT o.id FROM organizations o JOIN projects p ON p.organization_id = o.id
		WHERE p.id = $1 AND p.deletion_requested_at IS NULL AND o.deletion_requested_at IS NULL
		FOR SHARE OF o`, projectID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return controls.ErrProjectNotFound
	}
	if err != nil {
		return fmt.Errorf("lock project organization: %w", err)
	}
	return nil
}
