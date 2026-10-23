package store

import (
	"context"
	"fmt"
)

// This statement checks connectivity and the schema needed by the current
// binaries without scanning tenant data. Old/incomplete migrations fail closed.
func (s *Store) Ready(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `SELECT o.quota_version, i.token_hash, s.payload_bytes, r.identity_hash, a.id
		FROM organizations o CROSS JOIN organization_invitations i CROSS JOIN project_storage s
		CROSS JOIN revoked_sessions r CROSS JOIN organization_quota_actions a LIMIT 0`)
	if err != nil {
		return fmt.Errorf("backend schema unavailable; apply migrations through 00018: %w", err)
	}
	return nil
}
