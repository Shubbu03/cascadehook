package store

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"cascadehook/internal/auth"
)

// FindAPIKey resolves a complete token hash to its project. Missing and revoked
// credentials share the same result; the plaintext token never reaches SQL.
func (s *Store) FindAPIKey(ctx context.Context, digest [sha256.Size]byte) (auth.Principal, error) {
	var principal auth.Principal
	err := s.pool.QueryRow(ctx,
		`SELECT project_id, id FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
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
