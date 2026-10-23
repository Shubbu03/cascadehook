package store

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"cascadehook/internal/auth"
)

// FindAPIKey resolves a complete token hash to its project. Missing, expired,
// and revoked credentials share the same result. No plaintext reaches SQL.
func (s *Store) FindAPIKey(ctx context.Context, digest [sha256.Size]byte) (auth.Principal, error) {
	var principal auth.Principal
	err := s.pool.QueryRow(ctx,
		`SELECT k.project_id, k.id FROM api_keys k JOIN projects p ON p.id = k.project_id
		WHERE k.key_hash = $1 AND k.revoked_at IS NULL AND p.deletion_requested_at IS NULL
		AND (k.expires_at IS NULL OR k.expires_at > clock_timestamp())
		AND (k.revokes_at IS NULL OR k.revokes_at > clock_timestamp())`,
		digest[:],
	).Scan(&principal.ProjectID, &principal.APIKeyID)
	if errors.Is(err, pgx.ErrNoRows) {
		return auth.Principal{}, auth.ErrInvalidAPIKey
	}
	if err != nil {
		return auth.Principal{}, fmt.Errorf("find API key: %w", err)
	}
	return principal, nil
}
