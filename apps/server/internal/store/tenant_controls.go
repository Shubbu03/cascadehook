package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/accounts"
)

var operatorLabelPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$`)

type OwnershipRecovery struct {
	OrganizationID uuid.UUID `json:"organization_id"`
	UserID         uuid.UUID `json:"user_id"`
	ActionID       uuid.UUID `json:"action_id"`
}

// Operator database access is the only recovery authority. Customer tokens,
// matching email addresses and project keys can never claim seeded/orphan data.
func (s *Store) RecoverOrganizationOwner(
	ctx context.Context,
	organizationID, userID uuid.UUID,
	operator string,
) (OwnershipRecovery, error) {
	if !operatorLabelPattern.MatchString(operator) {
		return OwnershipRecovery{}, fmt.Errorf("operator label must match [A-Za-z0-9][A-Za-z0-9_.-]{0,63}")
	}
	id, err := uuid.NewV7()
	if err != nil {
		return OwnershipRecovery{}, fmt.Errorf("generate ownership audit ID: %w", err)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return OwnershipRecovery{}, fmt.Errorf("begin ownership recovery: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockActiveUsers(ctx, tx, userID); err != nil {
		return OwnershipRecovery{}, err
	}
	var found uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM organizations WHERE id = $1 AND deletion_requested_at IS NULL FOR UPDATE`,
		organizationID).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return OwnershipRecovery{}, accounts.ErrNotFound
	}
	if err != nil {
		return OwnershipRecovery{}, fmt.Errorf("lock ownership recovery organization: %w", err)
	}
	var hasOwner, isMember bool
	err = tx.QueryRow(
		ctx,
		`SELECT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
		WHERE m.organization_id = $1 AND m.role = 'owner' AND u.deletion_requested_at IS NULL),
		EXISTS(SELECT 1 FROM memberships WHERE organization_id = $1 AND user_id = $2)`,
		organizationID,
		userID,
	).Scan(&hasOwner, &isMember)
	if err != nil {
		return OwnershipRecovery{}, fmt.Errorf("check ownership recovery eligibility: %w", err)
	}
	if hasOwner {
		return OwnershipRecovery{}, fmt.Errorf("organization has an active owner; use normal membership management")
	}
	if !isMember {
		if err := checkUserOrganizationQuota(ctx, tx, userID); err != nil {
			return OwnershipRecovery{}, err
		}
		if err := checkResourceQuota(
			ctx,
			tx,
			organizationID,
			"members",
		); err != nil {
			return OwnershipRecovery{}, err
		}
	}
	_, err = tx.Exec(
		ctx,
		`INSERT INTO memberships (organization_id,user_id,role) VALUES ($1,$2,'owner')
		ON CONFLICT (organization_id,user_id) DO UPDATE SET role = 'owner', updated_at = clock_timestamp()`,
		organizationID,
		userID,
	)
	if err != nil {
		return OwnershipRecovery{}, fmt.Errorf("assign recovered owner: %w", err)
	}
	_, err = tx.Exec(
		ctx,
		`INSERT INTO organization_ownership_actions (id,organization_id,user_id,operator_label) VALUES ($1,$2,$3,$4)`,
		id,
		organizationID,
		userID,
		operator,
	)
	if err != nil {
		return OwnershipRecovery{}, fmt.Errorf("audit ownership recovery: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return OwnershipRecovery{}, fmt.Errorf("commit ownership recovery; inspect membership before retrying: %w", err)
	}
	return OwnershipRecovery{OrganizationID: organizationID, UserID: userID, ActionID: id}, nil
}

func (s *Store) SetOrganizationQuotas(ctx context.Context, change accounts.QuotaChange) error {
	limits := change.Limits
	if !operatorLabelPattern.MatchString(change.Operator) || change.ExpectedVersion < 0 {
		return fmt.Errorf("valid operator label and nonnegative expected quota version are required")
	}
	validResources := limits.Projects >= 1 && limits.Projects <= 1000 && limits.Members >= 1 && limits.Members <= 1000
	validChildren := limits.Endpoints >= 1 && limits.Endpoints <= 1000 && limits.APIKeys >= 1 && limits.APIKeys <= 1000
	validMonthly := limits.MonthlyEvents >= 1 && limits.MonthlyEvents <= 1_000_000_000_000 &&
		limits.MonthlyJobs >= 1 && limits.MonthlyJobs <= 1_000_000_000_000
	if !validResources || !validChildren || !validMonthly || limits.StoredBytes < 262144 || limits.StoredBytes > 1<<40 {
		return fmt.Errorf("invalid quota limits: resources 1-1000, monthly counts 1-10^12, payload bytes 256KiB-1TiB")
	}
	id, err := uuid.NewV7()
	if err != nil {
		return fmt.Errorf("generate quota audit ID: %w", err)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin quota update: %w", err)
	}
	defer rollbackTransaction(tx)
	result, err := tx.Exec(
		ctx,
		`UPDATE organizations SET max_projects = $2, max_members = $3, max_endpoints_per_project = $4,
		max_keys_per_project = $5, max_monthly_events = $6, max_monthly_deliveries = $7,
		max_payload_bytes_per_project = $8, updated_at = clock_timestamp(), quota_version = quota_version + 1
		WHERE id = $1 AND deletion_requested_at IS NULL AND quota_version = $9`,
		change.OrganizationID,
		limits.Projects,
		limits.Members,
		limits.Endpoints,
		limits.APIKeys,
		limits.MonthlyEvents,
		limits.MonthlyJobs,
		limits.StoredBytes,
		change.ExpectedVersion,
	)
	if err != nil {
		return fmt.Errorf("update tenant quotas: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("organization unavailable or quota version changed; read tenant status before retrying")
	}
	encoded, err := json.Marshal(limits)
	if err != nil {
		return fmt.Errorf("encode quota audit: %w", err)
	}
	_, err = tx.Exec(
		ctx,
		`INSERT INTO organization_quota_actions (id,organization_id,version,operator_label,limits)
		VALUES ($1,$2,$3,$4,$5)`,
		id,
		change.OrganizationID,
		change.ExpectedVersion+1,
		change.Operator,
		encoded,
	)
	if err != nil {
		return fmt.Errorf("audit quota update: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit quota update; inspect tenant status before retrying: %w", err)
	}
	return nil
}

func (s *Store) OperatorTenantStatus(ctx context.Context, organizationID uuid.UUID) (json.RawMessage, error) {
	var result json.RawMessage
	err := s.pool.QueryRow(ctx, `SELECT jsonb_build_object('organization_id',o.id,'name',o.name,
		'deletion_requested_at',o.deletion_requested_at,'quota_version',o.quota_version,'needs_owner_recovery',NOT EXISTS (
			SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = o.id
			AND m.role = 'owner' AND u.deletion_requested_at IS NULL),
		'limits',jsonb_build_object('projects',max_projects,'members',max_members,
		'endpoints_per_project',max_endpoints_per_project,'active_api_keys_per_project',max_keys_per_project,
		'monthly_events',max_monthly_events,'monthly_deliveries',max_monthly_deliveries,
		'payload_bytes_per_project',max_payload_bytes_per_project)) FROM organizations o WHERE o.id = $1`,
		organizationID).Scan(&result)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, accounts.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("read operator tenant status: %w", err)
	}
	return result, nil
}
