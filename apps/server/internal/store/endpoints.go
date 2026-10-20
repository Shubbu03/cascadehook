package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/endpoints"
)

func (s *Store) CreateEndpoint(ctx context.Context, projectID uuid.UUID, input endpoints.Registration) (endpoints.Endpoint, error) {
	address, err := endpoints.NormalizeURL(input.URL)
	if err != nil {
		return endpoints.Endpoint{}, err
	}
	types, err := endpoints.NormalizeEventTypes(input.EventTypes)
	if err != nil {
		return endpoints.Endpoint{}, err
	}
	id, err := uuid.NewV7()
	if err != nil {
		return endpoints.Endpoint{}, fmt.Errorf("generate endpoint ID: %w", err)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return endpoints.Endpoint{}, fmt.Errorf("begin endpoint registration: %w", err)
	}
	defer rollbackEndpointTransaction(tx)

	var endpoint endpoints.Endpoint
	err = tx.QueryRow(ctx,
		`INSERT INTO endpoints (id, project_id, url) VALUES ($1, $2, $3)
		 RETURNING id, project_id, url, enabled, verified_at, created_at, updated_at`,
		id, projectID, address,
	).Scan(&endpoint.ID, &endpoint.ProjectID, &endpoint.URL, &endpoint.Enabled,
		&endpoint.VerifiedAt, &endpoint.CreatedAt, &endpoint.UpdatedAt)
	if err != nil {
		return endpoints.Endpoint{}, fmt.Errorf("create endpoint: %w", err)
	}
	if err := replaceSubscriptions(ctx, tx, id, types); err != nil {
		return endpoints.Endpoint{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return endpoints.Endpoint{}, fmt.Errorf("commit endpoint registration: %w", err)
	}
	endpoint.EventTypes = types
	return endpoint, nil
}

// endpointColumns includes subscriptions in the same query to avoid a database
// round trip per endpoint. Only endpoints already scoped by project are read.
const endpointFields = `e.id, e.project_id, e.url, e.enabled, e.verified_at, e.created_at, e.updated_at`

const endpointColumns = endpointFields + `,
	ARRAY(SELECT event_type FROM endpoint_subscriptions WHERE endpoint_id = e.id ORDER BY event_type)`

// ListEndpoints fetches one extra row so the caller can decide whether a next
// cursor is needed without a second query.
func (s *Store) ListEndpoints(ctx context.Context, projectID uuid.UUID, options endpoints.ListOptions) ([]endpoints.Endpoint, error) {
	if options.Limit < 1 || options.Limit > 100 {
		return nil, fmt.Errorf("endpoint page limit must be between 1 and 100")
	}
	if options.EventType != "" && !endpoints.ValidEventType(options.EventType) {
		return nil, endpoints.ErrInvalidEventTypes
	}
	var createdBefore *time.Time
	beforeID := uuid.Nil
	if options.Before != nil {
		createdBefore = &options.Before.CreatedAt
		beforeID = options.Before.ID
	}
	rows, err := s.pool.Query(ctx, `SELECT `+endpointColumns+`
		FROM endpoints e WHERE e.project_id = $1 AND e.deleted_at IS NULL
		AND ($2::timestamptz IS NULL OR (e.created_at, e.id) < ($2::timestamptz, $3::uuid))
		AND ($5::boolean IS NULL OR e.enabled = $5::boolean)
		AND ($6::text = '' OR EXISTS (SELECT 1 FROM endpoint_subscriptions WHERE endpoint_id = e.id AND event_type = $6))
		ORDER BY e.created_at DESC, e.id DESC LIMIT $4`,
		projectID, createdBefore, beforeID, options.Limit+1, options.Enabled, options.EventType,
	)
	if err != nil {
		return nil, fmt.Errorf("list endpoints: %w", err)
	}
	defer rows.Close()
	result := make([]endpoints.Endpoint, 0, options.Limit+1)
	for rows.Next() {
		var endpoint endpoints.Endpoint
		if err := scanEndpoint(rows, &endpoint); err != nil {
			return nil, fmt.Errorf("read endpoint: %w", err)
		}
		result = append(result, endpoint)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read endpoints: %w", err)
	}
	return result, nil
}

func (s *Store) UpdateEndpoint(ctx context.Context, projectID, id uuid.UUID, input endpoints.Update) (endpoints.Endpoint, error) {
	if input.URL != nil {
		address, err := endpoints.NormalizeURL(*input.URL)
		if err != nil {
			return endpoints.Endpoint{}, err
		}
		input.URL = &address
	}
	if input.EventTypes != nil {
		types, err := endpoints.NormalizeEventTypes(*input.EventTypes)
		if err != nil {
			return endpoints.Endpoint{}, err
		}
		input.EventTypes = &types
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return endpoints.Endpoint{}, fmt.Errorf("begin endpoint update: %w", err)
	}
	defer rollbackEndpointTransaction(tx)
	var endpoint endpoints.Endpoint
	row := tx.QueryRow(ctx, `SELECT `+endpointFields+`
		FROM endpoints e WHERE e.project_id = $1 AND e.id = $2 AND e.deleted_at IS NULL FOR UPDATE OF e`,
		projectID, id)
	if err := row.Scan(&endpoint.ID, &endpoint.ProjectID, &endpoint.URL, &endpoint.Enabled,
		&endpoint.VerifiedAt, &endpoint.CreatedAt, &endpoint.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return endpoints.Endpoint{}, endpoints.ErrNotFound
		}
		return endpoints.Endpoint{}, fmt.Errorf("find endpoint for update: %w", err)
	}
	if input.URL != nil && *input.URL != endpoint.URL {
		endpoint.URL = *input.URL
		endpoint.Enabled = false
		endpoint.VerifiedAt = nil
	}
	if input.Enabled != nil {
		if *input.Enabled && endpoint.VerifiedAt == nil {
			return endpoints.Endpoint{}, endpoints.ErrVerificationRequired
		}
		endpoint.Enabled = *input.Enabled
	}
	if input.EventTypes != nil {
		if err := replaceSubscriptions(ctx, tx, id, *input.EventTypes); err != nil {
			return endpoints.Endpoint{}, err
		}
		endpoint.EventTypes = *input.EventTypes
	} else {
		// Read after taking the endpoint lock so a concurrent subscription
		// update that just committed cannot leave the response on an old snapshot.
		if err := tx.QueryRow(ctx, `SELECT ARRAY(SELECT event_type FROM endpoint_subscriptions
			WHERE endpoint_id = $1 ORDER BY event_type)`, id).Scan(&endpoint.EventTypes); err != nil {
			return endpoints.Endpoint{}, fmt.Errorf("read endpoint subscriptions: %w", err)
		}
	}
	err = tx.QueryRow(ctx, `UPDATE endpoints SET url = $3, enabled = $4, verified_at = $5, updated_at = now()
		WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING updated_at`,
		projectID, id, endpoint.URL, endpoint.Enabled, endpoint.VerifiedAt,
	).Scan(&endpoint.UpdatedAt)
	if err != nil {
		return endpoints.Endpoint{}, fmt.Errorf("update endpoint: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return endpoints.Endpoint{}, fmt.Errorf("commit endpoint update: %w", err)
	}
	return endpoint, nil
}

// DeleteEndpoint soft-deletes configuration. Delivery cancellation will be
// added to this operation in the same transaction when delivery jobs exist.
func (s *Store) DeleteEndpoint(ctx context.Context, projectID, id uuid.UUID) error {
	result, err := s.pool.Exec(ctx, `UPDATE endpoints SET enabled = false, deleted_at = now(), updated_at = now()
		WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL`, projectID, id)
	if err != nil {
		return fmt.Errorf("delete endpoint: %w", err)
	}
	if result.RowsAffected() == 0 {
		return endpoints.ErrNotFound
	}
	return nil
}

func replaceSubscriptions(ctx context.Context, tx pgx.Tx, endpointID uuid.UUID, types []string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM endpoint_subscriptions WHERE endpoint_id = $1`, endpointID); err != nil {
		return fmt.Errorf("replace endpoint subscriptions: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO endpoint_subscriptions (endpoint_id, event_type)
		SELECT $1, unnest($2::text[])`, endpointID, types); err != nil {
		return fmt.Errorf("insert endpoint subscriptions: %w", err)
	}
	return nil
}

func scanEndpoint(row pgx.Row, endpoint *endpoints.Endpoint) error {
	return row.Scan(&endpoint.ID, &endpoint.ProjectID, &endpoint.URL, &endpoint.Enabled,
		&endpoint.VerifiedAt, &endpoint.CreatedAt, &endpoint.UpdatedAt, &endpoint.EventTypes)
}

func rollbackEndpointTransaction(tx pgx.Tx) {
	ctx, cancel := context.WithTimeout(context.Background(), connectTimeout)
	defer cancel()
	_ = tx.Rollback(ctx)
}
