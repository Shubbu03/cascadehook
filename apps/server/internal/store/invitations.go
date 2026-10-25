package store

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/accounts"
	"cascadehook/internal/pagination"
)

const invitationColumns = `id, organization_id, email, role, created_at, expires_at, accepted_at, revoked_at`

func scanInvitation(row pgx.Row, invitation *accounts.Invitation) error {
	return row.Scan(
		&invitation.ID,
		&invitation.OrganizationID,
		&invitation.Email,
		&invitation.Role,
		&invitation.CreatedAt,
		&invitation.ExpiresAt,
		&invitation.AcceptedAt,
		&invitation.RevokedAt,
	)
}

type CreateInvitationParams struct {
	OrganizationID uuid.UUID
	Email          string
	Role           accounts.Role
	Hash           [sha256.Size]byte
}

func (s *Store) CreateInvitation(
	ctx context.Context,
	actorID uuid.UUID,
	params CreateInvitationParams,
) (accounts.Invitation, error) {
	email, err := accounts.NormalizeEmail(params.Email)
	if err != nil {
		return accounts.Invitation{}, err
	}
	if params.Role != accounts.Admin && params.Role != accounts.Member {
		return accounts.Invitation{}, accounts.ErrInvalidRole
	}
	id, err := uuid.NewV7()
	if err != nil {
		return accounts.Invitation{}, fmt.Errorf("generate invitation ID: %w", err)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return accounts.Invitation{}, fmt.Errorf("begin invitation: %w", err)
	}
	defer rollbackTransaction(tx)
	role, err := lockOrganizationAccess(
		ctx,
		tx,
		actorID,
		params.OrganizationID,
	)
	if err != nil {
		return accounts.Invitation{}, err
	}
	if role != accounts.Owner {
		return accounts.Invitation{}, accounts.ErrForbidden
	}
	if err := checkResourceQuota(
		ctx,
		tx,
		params.OrganizationID,
		"members",
	); err != nil {
		return accounts.Invitation{}, err
	}
	rateKey := sha256.Sum256([]byte("invitation-rate:" + actorID.String()))
	if err := lockIdentity(ctx, tx, rateKey); err != nil {
		return accounts.Invitation{}, err
	}
	var dailyCount int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM organization_invitations
		WHERE created_by_user_id = $1 AND created_at > clock_timestamp() - interval '24 hours'`,
		actorID).Scan(&dailyCount); err != nil {
		return accounts.Invitation{}, fmt.Errorf("check invitation creation budget: %w", err)
	}
	if dailyCount >= 100 {
		return accounts.Invitation{}, &accounts.QuotaError{Resource: "daily_invitations"}
	}
	var hasSlot bool
	if err := tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM memberships WHERE organization_id = o.id)
		+ (SELECT count(*) FROM organization_invitations WHERE organization_id = o.id AND accepted_at IS NULL
		AND revoked_at IS NULL AND expires_at > clock_timestamp()) < o.max_members FROM organizations o WHERE o.id = $1`,
		params.OrganizationID).Scan(&hasSlot); err != nil {
		return accounts.Invitation{}, fmt.Errorf("check pending invitation slots: %w", err)
	}
	if !hasSlot {
		return accounts.Invitation{}, &accounts.QuotaError{Resource: "invitation_slots"}
	}
	_, err = tx.Exec(
		ctx,
		`UPDATE organization_invitations SET revoked_at = clock_timestamp()
		WHERE organization_id = $1 AND email = $2 AND expires_at <= clock_timestamp()
		AND accepted_at IS NULL AND revoked_at IS NULL`,
		params.OrganizationID,
		email,
	)
	if err != nil {
		return accounts.Invitation{}, fmt.Errorf("retire expired invitation: %w", err)
	}
	var count int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM organization_invitations WHERE organization_id = $1`,
		params.OrganizationID).Scan(&count); err != nil {
		return accounts.Invitation{}, fmt.Errorf("count retained invitations: %w", err)
	}
	if count >= 1000 {
		return accounts.Invitation{}, &accounts.QuotaError{Resource: "retained_invitations"}
	}
	var invitation accounts.Invitation
	err = scanInvitation(tx.QueryRow(
		ctx,
		`INSERT INTO organization_invitations (id, organization_id, email, role, token_hash, created_by_user_id)
		VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING `+invitationColumns,
		id,
		params.OrganizationID,
		email,
		params.Role,
		params.Hash[:],
		actorID,
	), &invitation)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.Invitation{}, accounts.ErrInvitationConflict
	}
	if err != nil {
		return accounts.Invitation{}, fmt.Errorf("create invitation: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return accounts.Invitation{}, fmt.Errorf("commit invitation; revoke and recreate if token response is lost: %w", err)
	}
	return invitation, nil
}

func (s *Store) ListInvitations(
	ctx context.Context,
	actorID, organizationID uuid.UUID,
	options pagination.Options,
) ([]accounts.Invitation, error) {
	if err := options.Validate(); err != nil {
		return nil, err
	}
	org, err := s.GetOrganization(ctx, actorID, organizationID)
	if err != nil {
		return nil, err
	}
	if org.Role != accounts.Owner {
		return nil, accounts.ErrForbidden
	}
	query := `SELECT ` + invitationColumns + ` FROM organization_invitations WHERE organization_id = $1`
	args := []any{organizationID}
	if options.Before != nil {
		query += ` AND (created_at,id) < ($2,$3)`
		args = append(args, options.Before.CreatedAt, options.Before.ID)
	}
	args = append(args, options.Limit+1)
	query += fmt.Sprintf(` ORDER BY created_at DESC,id DESC LIMIT $%d`, len(args))
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list invitations: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (accounts.Invitation, error) {
		var invitation accounts.Invitation
		err := scanInvitation(row, &invitation)
		return invitation, err
	})
}

func (s *Store) RevokeInvitation(ctx context.Context, actorID, organizationID, id uuid.UUID) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin invitation revocation: %w", err)
	}
	defer rollbackTransaction(tx)
	role, err := lockOrganizationAccess(
		ctx,
		tx,
		actorID,
		organizationID,
	)
	if err != nil {
		return err
	}
	if role != accounts.Owner {
		return accounts.ErrForbidden
	}
	var accepted bool
	err = tx.QueryRow(
		ctx,
		`SELECT accepted_at IS NOT NULL FROM organization_invitations
		WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
		organizationID,
		id,
	).Scan(&accepted)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("find invitation to revoke: %w", err)
	}
	if accepted {
		return accounts.ErrInvitationInvalid
	}
	if _, err := tx.Exec(ctx, `UPDATE organization_invitations SET revoked_at = coalesce(revoked_at,clock_timestamp())
		WHERE id = $1`, id); err != nil {
		return fmt.Errorf("revoke invitation: %w", err)
	}
	return tx.Commit(ctx)
}

func (s *Store) InvitationIdentity(ctx context.Context, userID uuid.UUID, hash [sha256.Size]byte) (string, error) {
	var exists bool
	err := s.pool.QueryRow(
		ctx,
		`SELECT EXISTS(SELECT 1 FROM organization_invitations i
		JOIN organizations o ON o.id = i.organization_id WHERE i.token_hash = $1
		AND o.deletion_requested_at IS NULL AND i.revoked_at IS NULL
		AND (i.expires_at > clock_timestamp() OR i.accepted_by_user_id = $2))`,
		hash[:],
		userID,
	).Scan(&exists)
	if err != nil {
		return "", fmt.Errorf("check invitation availability: %w", err)
	}
	if !exists {
		return "", accounts.ErrInvitationInvalid
	}
	var subject string
	err = s.pool.QueryRow(ctx, `UPDATE users SET invitation_lookup_at = clock_timestamp()
		WHERE id = $1 AND deletion_requested_at IS NULL
		AND (invitation_lookup_at IS NULL OR invitation_lookup_at <= clock_timestamp() - interval '5 seconds')
		RETURNING identity_subject`,
		userID).Scan(&subject)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", accounts.ErrInvitationRateLimited
	}
	if err != nil {
		return "", fmt.Errorf("read invitation identity: %w", err)
	}
	return subject, nil
}

func (s *Store) AcceptInvitation(
	ctx context.Context,
	userID uuid.UUID,
	hash [sha256.Size]byte,
	verifiedEmails []string,
) (accounts.Membership, error) {
	// Locate only the parent, then lock in user -> organization -> invitation
	// order. No token/email can grant membership without authoritative checks.
	var organizationID uuid.UUID
	var inviterID uuid.UUID
	err := s.pool.QueryRow(ctx, `SELECT organization_id,created_by_user_id
		FROM organization_invitations WHERE token_hash = $1`,
		hash[:]).Scan(&organizationID, &inviterID)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.Membership{}, accounts.ErrInvitationInvalid
	}
	if err != nil {
		return accounts.Membership{}, fmt.Errorf("locate invitation: %w", err)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return accounts.Membership{}, fmt.Errorf("begin invitation acceptance: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockActiveUsers(
		ctx,
		tx,
		userID,
		inviterID,
	); err != nil {
		if errors.Is(err, accounts.ErrUserNotFound) {
			return accounts.Membership{}, accounts.ErrInvitationInvalid
		}
		return accounts.Membership{}, err
	}
	err = tx.QueryRow(ctx, `SELECT id FROM organizations WHERE id = $1 AND deletion_requested_at IS NULL FOR UPDATE`,
		organizationID).Scan(&organizationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.Membership{}, accounts.ErrInvitationInvalid
	}
	if err != nil {
		return accounts.Membership{}, fmt.Errorf("lock invitation organization: %w", err)
	}
	var email string
	var role accounts.Role
	var acceptedBy *uuid.UUID
	var valid bool
	err = tx.QueryRow(ctx, `SELECT i.email, i.role, i.accepted_by_user_id,
		i.revoked_at IS NULL AND i.expires_at > clock_timestamp()
		AND EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
			WHERE m.organization_id = i.organization_id AND m.user_id = i.created_by_user_id
			AND m.role = 'owner' AND u.deletion_requested_at IS NULL)
		FROM organization_invitations i WHERE i.token_hash = $1 FOR UPDATE OF i`, hash[:]).
		Scan(
			&email,
			&role,
			&acceptedBy,
			&valid,
		)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.Membership{}, accounts.ErrInvitationInvalid
	}
	if err != nil {
		return accounts.Membership{}, fmt.Errorf("read invitation for acceptance: %w", err)
	}
	if acceptedBy != nil {
		if *acceptedBy != userID {
			return accounts.Membership{}, accounts.ErrInvitationInvalid
		}
		var member accounts.Membership
		err := scanMembership(tx.QueryRow(
			ctx,
			`SELECT organization_id,user_id,role,created_at,updated_at
			FROM memberships WHERE organization_id = $1 AND user_id = $2`,
			organizationID,
			userID,
		), &member)
		if errors.Is(err, pgx.ErrNoRows) {
			return accounts.Membership{}, accounts.ErrInvitationInvalid
		}
		return member, err
	}
	if !valid {
		return accounts.Membership{}, accounts.ErrInvitationInvalid
	}
	if !slices.Contains(verifiedEmails, email) {
		return accounts.Membership{}, accounts.ErrInvitationEmail
	}
	var existing bool
	if err := tx.QueryRow(
		ctx,
		`SELECT EXISTS(SELECT 1 FROM memberships WHERE organization_id = $1 AND user_id = $2)`,
		organizationID,
		userID,
	).Scan(&existing); err != nil {
		return accounts.Membership{}, fmt.Errorf("check invitation membership: %w", err)
	}
	if !existing {
		if err := checkUserOrganizationQuota(ctx, tx, userID); err != nil {
			return accounts.Membership{}, err
		}
		if err := checkResourceQuota(
			ctx,
			tx,
			organizationID,
			"members",
		); err != nil {
			return accounts.Membership{}, err
		}
	}
	var member accounts.Membership
	err = scanMembership(tx.QueryRow(
		ctx,
		`INSERT INTO memberships (organization_id,user_id,role) VALUES ($1,$2,$3)
		ON CONFLICT (organization_id,user_id) DO UPDATE SET user_id = EXCLUDED.user_id
		RETURNING organization_id,user_id,role,created_at,updated_at`,
		organizationID,
		userID,
		role,
	), &member)
	if err != nil {
		return accounts.Membership{}, fmt.Errorf("accept invitation membership: %w", err)
	}
	if _, err := tx.Exec(
		ctx,
		`UPDATE organization_invitations SET accepted_at = clock_timestamp(), accepted_by_user_id = $2
		WHERE token_hash = $1`,
		hash[:],
		userID,
	); err != nil {
		return accounts.Membership{}, fmt.Errorf("consume invitation: %w", err)
	}
	if err := completeOnboarding(ctx, tx, userID); err != nil {
		return accounts.Membership{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return accounts.Membership{}, fmt.Errorf("commit invitation acceptance; retry token to resolve: %w", err)
	}
	return member, nil
}
