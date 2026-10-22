package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/limits"
)

// AdmitProjectRequest uses a separate row from project configuration, avoiding
// a configuration lock for every request. PostgreSQL serializes competing
// UPSERTs for the same project; credentials and API replicas share one balance.
func (s *Store) AdmitProjectRequest(
	ctx context.Context,
	projectID uuid.UUID,
	budget limits.Budget,
) (bool, error) {
	if err := budget.Validate(); err != nil {
		return false, err
	}
	// All SQL fragments are fixed expressions. Rate/burst/identity are bound
	// parameters. Read database time after contention, not transaction time.
	const refilled = `least($3::double precision, b.available_tokens +
		greatest(0, extract(epoch FROM (clock_timestamp() - b.refilled_at))) * $2::double precision)`
	var project uuid.UUID
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO project_request_budgets AS b (project_id, available_tokens, refilled_at)
		VALUES ($1, $3::double precision - 1, clock_timestamp())
		ON CONFLICT (project_id) DO UPDATE SET available_tokens = `+refilled+` - 1,
		refilled_at = greatest(b.refilled_at, clock_timestamp()) WHERE `+refilled+` >= 1
		RETURNING project_id`,
		projectID,
		float64(budget.Rate),
		float64(budget.Burst),
	).Scan(&project)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("admit project request: %w", err)
	}
	return true, nil
}
