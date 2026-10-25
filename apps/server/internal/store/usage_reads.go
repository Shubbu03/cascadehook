package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/accounts"
)

func (s *Store) GetUsage(ctx context.Context, organizationID, projectID uuid.UUID) (accounts.Usage, error) {
	// A single repeatable-read snapshot keeps resource totals and counters
	// consistent while ingestion, cleanup and membership changes continue.
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return accounts.Usage{}, fmt.Errorf("begin usage snapshot: %w", err)
	}
	defer rollbackTransaction(tx)
	usage := accounts.Usage{OrganizationID: organizationID}
	var period time.Time
	err = tx.QueryRow(ctx, `SELECT max_projects, max_members, max_endpoints_per_project, max_keys_per_project,
		max_monthly_events, max_monthly_deliveries, max_payload_bytes_per_project,
		date_trunc('month', now() AT TIME ZONE 'UTC')::date FROM organizations
		WHERE id = $1 AND deletion_requested_at IS NULL`, organizationID).Scan(
		&usage.Quotas.Projects,
		&usage.Quotas.Members,
		&usage.Quotas.Endpoints,
		&usage.Quotas.APIKeys,
		&usage.Quotas.MonthlyEvents,
		&usage.Quotas.MonthlyJobs,
		&usage.Quotas.StoredBytes,
		&period,
	)
	if err == pgx.ErrNoRows {
		return accounts.Usage{}, accounts.ErrNotFound
	}
	if err != nil {
		return accounts.Usage{}, fmt.Errorf("read usage limits: %w", err)
	}
	usage.Period = period.Format("2006-01")
	usage.ResetsAt = time.Date(
		period.Year(),
		period.Month()+1,
		1,
		0,
		0,
		0,
		0,
		time.UTC,
	)
	if projectID != uuid.Nil {
		usage.ProjectID = &projectID
	}
	// SQL only selects from fixed table alternatives; resource IDs are bound.
	query := `SELECT coalesce(sum(events),0), coalesce(sum(deliveries),0), coalesce(sum(payload_bytes),0),
		coalesce(sum(attempts),0), coalesce(sum(replays),0), coalesce(sum(succeeded),0), coalesce(sum(failed),0)
		FROM organization_usage_months WHERE organization_id = $1 AND period = $2`
	id := organizationID
	if projectID != uuid.Nil {
		query = `SELECT coalesce(sum(events),0), coalesce(sum(deliveries),0), coalesce(sum(payload_bytes),0),
			coalesce(sum(attempts),0), coalesce(sum(replays),0), coalesce(sum(succeeded),0), coalesce(sum(failed),0)
			FROM project_usage_months WHERE project_id = $1 AND period = $2`
		id = projectID
	}
	err = tx.QueryRow(
		ctx,
		query,
		id,
		period,
	).Scan(
		&usage.Counters.Events,
		&usage.Counters.Deliveries,
		&usage.Counters.PayloadBytes,
		&usage.Counters.Attempts,
		&usage.Counters.Replays,
		&usage.Counters.Succeeded,
		&usage.Counters.Failed,
	)
	if err != nil {
		return accounts.Usage{}, fmt.Errorf("read usage counters: %w", err)
	}
	err = tx.QueryRow(
		ctx,
		`SELECT count(*), coalesce(sum(s.payload_bytes),0),
		coalesce(sum((SELECT count(*) FROM endpoints e WHERE e.project_id = p.id)),0),
		coalesce(sum((SELECT count(*) FROM api_keys k WHERE k.project_id = p.id AND k.revoked_at IS NULL
			AND (k.expires_at IS NULL OR k.expires_at > now()) AND (k.revokes_at IS NULL OR k.revokes_at > now()))),0)
		FROM projects p LEFT JOIN project_storage s ON s.project_id = p.id
		WHERE p.organization_id = $1 AND p.deletion_requested_at IS NULL
		AND ($2::uuid IS NULL OR p.id = $2)`,
		organizationID,
		nullableUUID(projectID),
	).Scan(
		&usage.Projects,
		&usage.StoredBytes,
		&usage.Endpoints,
		&usage.APIKeys,
	)
	if err != nil {
		return accounts.Usage{}, fmt.Errorf("read resource usage: %w", err)
	}
	if projectID != uuid.Nil && usage.Projects == 0 {
		return accounts.Usage{}, accounts.ErrNotFound
	}
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM memberships WHERE organization_id = $1`,
		organizationID).Scan(&usage.Members); err != nil {
		return accounts.Usage{}, fmt.Errorf("read member usage: %w", err)
	}
	return usage, nil
}
