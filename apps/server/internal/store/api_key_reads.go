package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/auth"
)

// #nosec G101 -- This SQL expression computes public key lifecycle status; it contains no credentials.
const apiKeyStatus = `CASE WHEN k.revoked_at IS NOT NULL OR k.revokes_at <= now() THEN 'revoked'
	WHEN k.expires_at <= now() THEN 'expired' ELSE 'active' END`

const apiKeyColumns = `k.id, k.project_id, k.name, k.key_prefix, split_part(k.key_prefix, '_', 2), ` + apiKeyStatus + `,
	k.created_at, k.expires_at, k.revoked_at, k.revokes_at, k.rotated_to_id, k.created_by_api_key_id, k.revoked_by_api_key_id`

func scanAPIKey(row pgx.Row, key *auth.APIKey) error {
	return row.Scan(
		&key.ID,
		&key.ProjectID,
		&key.Name,
		&key.Prefix,
		&key.Environment,
		&key.Status,
		&key.CreatedAt,
		&key.ExpiresAt,
		&key.RevokedAt,
		&key.RevokesAt,
		&key.RotatedToID,
		&key.CreatedByAPIKeyID,
		&key.RevokedByAPIKeyID,
	)
}

func (s *Store) GetAPIKey(ctx context.Context, projectID, id uuid.UUID) (auth.APIKey, error) {
	var key auth.APIKey
	err := scanAPIKey(s.pool.QueryRow(
		ctx,
		`SELECT `+apiKeyColumns+`
		FROM api_keys k WHERE k.project_id = $1 AND k.id = $2`,
		projectID,
		id,
	), &key)
	if errors.Is(err, pgx.ErrNoRows) {
		return auth.APIKey{}, auth.ErrAPIKeyNotFound
	}
	if err != nil {
		return auth.APIKey{}, fmt.Errorf("get API key: %w", err)
	}
	return key, nil
}

func (s *Store) ListAPIKeys(
	ctx context.Context,
	projectID uuid.UUID,
	options auth.KeyListOptions,
) ([]auth.APIKey, error) {
	if err := options.Options.Validate(); err != nil {
		return nil, err
	}
	if options.Environment != "" && !auth.ValidKeyEnvironment(options.Environment) {
		return nil, auth.ErrInvalidKeyEnvironment
	}
	if options.Status != "" && !auth.ValidKeyStatus(options.Status) {
		return nil, fmt.Errorf("invalid API key status")
	}
	query := `SELECT ` + apiKeyColumns + ` FROM api_keys k WHERE k.project_id = $1`
	args := []any{projectID}
	if options.Environment != "" {
		args = append(args, options.Environment)
		query += fmt.Sprintf(` AND split_part(k.key_prefix, '_', 2) = $%d`, len(args))
	}
	if options.Status != "" {
		args = append(args, options.Status)
		query += fmt.Sprintf(` AND (`+apiKeyStatus+`) = $%d`, len(args))
	}
	if options.Before != nil {
		args = append(args, options.Before.CreatedAt, options.Before.ID)
		query += fmt.Sprintf(` AND (k.created_at, k.id) < ($%d, $%d)`, len(args)-1, len(args))
	}
	args = append(args, options.Limit+1)
	query += fmt.Sprintf(` ORDER BY k.created_at DESC, k.id DESC LIMIT $%d`, len(args))
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list API keys: %w", err)
	}
	result, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (auth.APIKey, error) {
		var key auth.APIKey
		err := scanAPIKey(row, &key)
		return key, err
	})
	if err != nil {
		return nil, fmt.Errorf("read API keys: %w", err)
	}
	return result, nil
}
