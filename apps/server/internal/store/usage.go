package store

import (
	"context"
	"crypto/sha256"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/accounts"
)

type usageDelta struct {
	events, jobs, bytes, attempts, replays, succeeded, failed int64
}

// Parent organization/project locks must already be held. Shared month rows
// serialize quota admission across all API replicas and projects in a tenant.
func recordUsage(ctx context.Context, tx pgx.Tx, projectID uuid.UUID, delta usageDelta) error {
	var organizationID uuid.UUID
	var eventLimit, jobLimit int64
	var period time.Time
	err := tx.QueryRow(ctx, `SELECT o.id, o.max_monthly_events, o.max_monthly_deliveries,
		date_trunc('month', clock_timestamp() AT TIME ZONE 'UTC')::date
		FROM projects p JOIN organizations o ON o.id = p.organization_id WHERE p.id = $1`,
		projectID).Scan(
		&organizationID,
		&eventLimit,
		&jobLimit,
		&period,
	)
	if err != nil {
		return fmt.Errorf("read usage admission limits: %w", err)
	}
	result, err := tx.Exec(
		ctx,
		`INSERT INTO organization_usage_months AS u
		(organization_id, period, events, deliveries, payload_bytes, attempts, replays, succeeded, failed)
		SELECT $1, $11::date, $2,$3,$4,$5,$6,$7,$8
		WHERE $2::bigint <= $9 AND $3::bigint <= $10
		ON CONFLICT (organization_id, period) DO UPDATE SET events = u.events + EXCLUDED.events,
		deliveries = u.deliveries + EXCLUDED.deliveries, payload_bytes = u.payload_bytes + EXCLUDED.payload_bytes,
		attempts = u.attempts + EXCLUDED.attempts, replays = u.replays + EXCLUDED.replays,
		succeeded = u.succeeded + EXCLUDED.succeeded, failed = u.failed + EXCLUDED.failed
		WHERE (EXCLUDED.events = 0 OR u.events + EXCLUDED.events <= $9)
		AND (EXCLUDED.deliveries = 0 OR u.deliveries + EXCLUDED.deliveries <= $10)`,
		organizationID,
		delta.events,
		delta.jobs,
		delta.bytes,
		delta.attempts,
		delta.replays,
		delta.succeeded,
		delta.failed,
		eventLimit,
		jobLimit,
		period,
	)
	if err != nil {
		return fmt.Errorf("record organization usage: %w", err)
	}
	if result.RowsAffected() == 0 {
		return &accounts.QuotaError{Resource: "monthly_events_or_deliveries"}
	}
	_, err = tx.Exec(
		ctx,
		`INSERT INTO project_usage_months AS u
		(project_id, period, events, deliveries, payload_bytes, attempts, replays, succeeded, failed)
		VALUES ($1,$9::date,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (project_id, period) DO UPDATE SET events = u.events + EXCLUDED.events,
		deliveries = u.deliveries + EXCLUDED.deliveries, payload_bytes = u.payload_bytes + EXCLUDED.payload_bytes,
		attempts = u.attempts + EXCLUDED.attempts, replays = u.replays + EXCLUDED.replays,
		succeeded = u.succeeded + EXCLUDED.succeeded, failed = u.failed + EXCLUDED.failed`,
		projectID,
		delta.events,
		delta.jobs,
		delta.bytes,
		delta.attempts,
		delta.replays,
		delta.succeeded,
		delta.failed,
		period,
	)
	if err != nil {
		return fmt.Errorf("record project usage: %w", err)
	}
	if delta.events > 0 || delta.jobs > 0 || delta.bytes > 0 {
		return notifyUsageThresholds(ctx, tx, projectID, period)
	}
	return nil
}

func reservePayloadStorage(ctx context.Context, tx pgx.Tx, projectID uuid.UUID, size int) error {
	result, err := tx.Exec(
		ctx,
		`INSERT INTO project_storage AS s (project_id, payload_bytes)
		SELECT p.id, $2::bigint FROM projects p JOIN organizations o ON o.id = p.organization_id
		WHERE p.id = $1 AND $2::bigint <= o.max_payload_bytes_per_project
		ON CONFLICT (project_id) DO UPDATE SET payload_bytes = s.payload_bytes + EXCLUDED.payload_bytes
		WHERE s.payload_bytes + EXCLUDED.payload_bytes <=
		(SELECT o.max_payload_bytes_per_project FROM projects p JOIN organizations o ON o.id = p.organization_id
		 WHERE p.id = $1)`,
		projectID,
		size,
	)
	if err != nil {
		return fmt.Errorf("reserve payload storage: %w", err)
	}
	if result.RowsAffected() == 0 {
		return &accounts.QuotaError{Resource: "stored_payload_bytes"}
	}
	return nil
}

// Membership-producing paths call this under user locks and before insertion.
func checkUserOrganizationQuota(ctx context.Context, tx pgx.Tx, userID uuid.UUID) error {
	digest := sha256.Sum256([]byte("membership-quota:" + userID.String()))
	if err := lockIdentity(ctx, tx, digest); err != nil {
		return err
	}
	var count int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM memberships WHERE user_id = $1`, userID).Scan(&count); err != nil {
		return fmt.Errorf("count account memberships: %w", err)
	}
	if count >= 20 {
		return &accounts.QuotaError{Resource: "account_organizations"}
	}
	return nil
}

func checkResourceQuota(ctx context.Context, tx pgx.Tx, id uuid.UUID, resource string) error {
	// Only fixed local statements enter this allowlist; no request SQL fragments.
	queries := map[string]string{
		"projects": `SELECT (SELECT count(*) FROM projects
			WHERE organization_id = o.id AND deletion_requested_at IS NULL) < o.max_projects
			FROM organizations o WHERE o.id = $1`,
		"members": `SELECT (SELECT count(*) FROM memberships WHERE organization_id = o.id) < o.max_members
			FROM organizations o WHERE o.id = $1`,
		"endpoints": `SELECT (SELECT count(*) FROM endpoints e WHERE e.project_id = p.id)
			< o.max_endpoints_per_project FROM projects p JOIN organizations o ON o.id = p.organization_id WHERE p.id = $1`,
		"api_keys": `SELECT (SELECT count(*) FROM api_keys k WHERE k.project_id = p.id AND k.revoked_at IS NULL
			AND (k.expires_at IS NULL OR k.expires_at > clock_timestamp())
			AND k.revokes_at IS NULL) < o.max_keys_per_project
			AND (SELECT count(*) FROM api_keys k WHERE k.project_id = p.id) < 1000
			FROM projects p JOIN organizations o ON o.id = p.organization_id WHERE p.id = $1`,
		"retained_api_keys": `SELECT count(*) < 1000 FROM api_keys WHERE project_id = $1`,
	}
	query, ok := queries[resource]
	if !ok {
		return fmt.Errorf("unsupported quota resource")
	}
	var allowed bool
	if err := tx.QueryRow(ctx, query, id).Scan(&allowed); err != nil {
		return fmt.Errorf("check resource quota: %w", err)
	}
	if !allowed {
		return &accounts.QuotaError{Resource: resource}
	}
	return nil
}
