package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/endpoints"
)

func (s *Store) GetEndpoint(ctx context.Context, projectID, id uuid.UUID) (endpoints.Endpoint, error) {
	var endpoint endpoints.Endpoint
	err := scanEndpoint(s.pool.QueryRow(
		ctx,
		`SELECT `+endpointColumns+` FROM endpoints e JOIN projects p ON p.id = e.project_id
		JOIN organizations o ON o.id = p.organization_id WHERE e.project_id = $1 AND e.id = $2
		AND e.deleted_at IS NULL AND p.deletion_requested_at IS NULL AND o.deletion_requested_at IS NULL`,
		projectID,
		id,
	), &endpoint)
	if errors.Is(err, pgx.ErrNoRows) {
		return endpoints.Endpoint{}, endpoints.ErrNotFound
	}
	if err != nil {
		return endpoints.Endpoint{}, fmt.Errorf("get endpoint: %w", err)
	}
	return endpoint, nil
}
