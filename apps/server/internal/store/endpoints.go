package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/endpoints"
	"cascadehook/internal/events"
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
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return endpoints.Endpoint{}, fmt.Errorf("begin endpoint registration: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockProjectForEndpointChange(ctx, tx, projectID); err != nil {
		return endpoints.Endpoint{}, err
	}
	if err := requireActiveProject(ctx, tx, projectID); err != nil {
		return endpoints.Endpoint{}, err
	}

	var endpoint endpoints.Endpoint
	err = tx.QueryRow(ctx,
		`INSERT INTO endpoints (id, project_id, url) VALUES ($1, $2, $3)
		 RETURNING id, project_id, url, enabled, verified_at, created_at, updated_at, signing_secret IS NOT NULL`,
		id, projectID, address,
	).Scan(&endpoint.ID, &endpoint.ProjectID, &endpoint.URL, &endpoint.Enabled,
		&endpoint.VerifiedAt, &endpoint.CreatedAt, &endpoint.UpdatedAt, &endpoint.HasSigningSecret)
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
const endpointFields = `e.id, e.project_id, e.url, e.enabled, e.verified_at, e.created_at, e.updated_at, e.signing_secret IS NOT NULL`

const endpointColumns = endpointFields + `,
	ARRAY(SELECT event_type FROM endpoint_subscriptions WHERE endpoint_id = e.id ORDER BY event_type)`

// ListEndpoints fetches one extra row so the caller can decide whether a next
// cursor is needed without a second query.
func (s *Store) ListEndpoints(ctx context.Context, projectID uuid.UUID, options endpoints.ListOptions) ([]endpoints.Endpoint, error) {
	if options.Limit < 1 || options.Limit > 100 {
		return nil, fmt.Errorf("endpoint page limit must be between 1 and 100")
	}
	if options.EventType != "" && !events.ValidType(options.EventType) {
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
		AND EXISTS (SELECT 1 FROM projects p WHERE p.id = e.project_id AND p.deletion_requested_at IS NULL
		AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = p.organization_id AND o.deletion_requested_at IS NULL))
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
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return endpoints.Endpoint{}, fmt.Errorf("begin endpoint update: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockProjectForEndpointChange(ctx, tx, projectID); err != nil {
		return endpoints.Endpoint{}, err
	}
	if input.Enabled != nil && *input.Enabled {
		if err := requireActiveProject(ctx, tx, projectID); err != nil {
			return endpoints.Endpoint{}, err
		}
	}
	var endpoint endpoints.Endpoint
	row := tx.QueryRow(ctx, `SELECT `+endpointFields+`
		FROM endpoints e WHERE e.project_id = $1 AND e.id = $2 AND e.deleted_at IS NULL FOR UPDATE OF e`,
		projectID, id)
	if err := row.Scan(&endpoint.ID, &endpoint.ProjectID, &endpoint.URL, &endpoint.Enabled,
		&endpoint.VerifiedAt, &endpoint.CreatedAt, &endpoint.UpdatedAt, &endpoint.HasSigningSecret); err != nil {
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
		if *input.Enabled && !endpoint.HasSigningSecret {
			return endpoints.Endpoint{}, endpoints.ErrSigningSecretRequired
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
	err = tx.QueryRow(ctx, `UPDATE endpoints SET url = $3, enabled = $4, verified_at = $5, updated_at = now(),
		verification_version = verification_version + CASE WHEN url <> $3 THEN 1 ELSE 0 END
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

// DeleteEndpoint soft-deletes configuration and cancels pending jobs atomically.
func (s *Store) DeleteEndpoint(ctx context.Context, projectID, id uuid.UUID) error {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return fmt.Errorf("begin endpoint deletion: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockProjectForEndpointChange(ctx, tx, projectID); err != nil {
		return err
	}
	result, err := tx.Exec(ctx, `UPDATE endpoints SET enabled = false, deleted_at = now(), updated_at = now()
		WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL`, projectID, id)
	if err != nil {
		return fmt.Errorf("delete endpoint: %w", err)
	}
	if result.RowsAffected() == 0 {
		return endpoints.ErrNotFound
	}
	if _, err := tx.Exec(ctx, `UPDATE deliveries SET state = 'canceled', updated_at = now()
		WHERE project_id = $1 AND endpoint_id = $2 AND state = 'pending'`, projectID, id); err != nil {
		return fmt.Errorf("cancel endpoint deliveries: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit endpoint deletion: %w", err)
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
		&endpoint.VerifiedAt, &endpoint.CreatedAt, &endpoint.UpdatedAt, &endpoint.HasSigningSecret, &endpoint.EventTypes)
}

// This lock must precede endpoint row locks in every configuration mutation.
// Publications hold the shared counterpart while reading subscriptions.
func lockProjectForEndpointChange(ctx context.Context, tx pgx.Tx, projectID uuid.UUID) error {
	if err := lockProjectOrganization(ctx, tx, projectID); err != nil {
		return err
	}
	var id uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM projects
		WHERE id = $1 AND deletion_requested_at IS NULL FOR UPDATE`, projectID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return endpoints.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("lock endpoint project: %w", err)
	}
	return nil
}
