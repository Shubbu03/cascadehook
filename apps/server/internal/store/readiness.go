package store

import (
	"context"
	"fmt"
)

// This statement checks connectivity and the schema needed by the current
// binaries without scanning tenant data. Old/incomplete migrations fail closed.
func (s *Store) Ready(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `SELECT o.quota_version, i.token_hash, s.payload_bytes, v.identity_hash,
		a.id, b.completed_at, 'projects_organization_name_key'::regclass,
		n.source_key, r.membership_created_at, d.last_failure_at
		FROM organizations o CROSS JOIN organization_invitations i CROSS JOIN project_storage s
		CROSS JOIN revoked_sessions v CROSS JOIN organization_quota_actions a CROSS JOIN user_onboarding b
		CROSS JOIN notifications n CROSS JOIN notification_recipients r CROSS JOIN notification_delivery_state d LIMIT 0`)
	if err != nil {
		return fmt.Errorf("backend schema unavailable; apply migrations through 00021: %w", err)
	}
	return nil
}
