package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/accounts"
	"cascadehook/internal/pagination"
)

func (s *Store) ListMemberships(
	ctx context.Context,
	userID, organizationID uuid.UUID,
	options pagination.Options,
) ([]accounts.Membership, error) {
	if err := options.Validate(); err != nil {
		return nil, err
	}
	if _, err := s.GetOrganization(ctx, userID, organizationID); err != nil {
		return nil, err
	}
	query := `SELECT m.organization_id, m.user_id, m.role, m.created_at, m.updated_at,
		u.identity_issuer, u.identity_subject
		FROM memberships m JOIN users u ON u.id = m.user_id
		WHERE m.organization_id = $1 AND u.deletion_requested_at IS NULL`
	args := []any{organizationID}
	if options.Before != nil {
		args = append(args, options.Before.CreatedAt, options.Before.ID)
		query += ` AND (m.created_at, m.user_id) < ($2, $3)`
	}
	args = append(args, options.Limit+1)
	query += fmt.Sprintf(` ORDER BY m.created_at DESC, m.user_id DESC LIMIT $%d`, len(args))
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list organization members: %w", err)
	}
	result, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (accounts.Membership, error) {
		var member accounts.Membership
		err := row.Scan(
			&member.OrganizationID,
			&member.UserID,
			&member.Role,
			&member.CreatedAt,
			&member.UpdatedAt,
			&member.IdentityIssuer,
			&member.IdentitySubject,
		)
		return member, err
	})
	if err != nil {
		return nil, fmt.Errorf("read organization members: %w", err)
	}
	return result, nil
}

type MembershipParams struct {
	OrganizationID uuid.UUID
	UserID         uuid.UUID
	Role           accounts.Role
}

func (s *Store) AddMembership(
	ctx context.Context,
	actorID uuid.UUID,
	params MembershipParams,
) (accounts.Membership, error) {
	if !params.Role.Valid() {
		return accounts.Membership{}, accounts.ErrInvalidRole
	}
	// Reject unauthorized callers before locking the target's user row.
	// Authorization is rechecked under the organization lock below.
	organization, err := s.GetOrganization(ctx, actorID, params.OrganizationID)
	if err != nil {
		return accounts.Membership{}, err
	}
	if organization.Role != accounts.Owner {
		return accounts.Membership{}, accounts.ErrForbidden
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return accounts.Membership{}, fmt.Errorf("begin membership creation: %w", err)
	}
	defer rollbackTransaction(tx)
	targetErr := lockActiveUsers(
		ctx,
		tx,
		actorID,
		params.UserID,
	)
	if targetErr != nil && !errors.Is(targetErr, accounts.ErrUserNotFound) {
		return accounts.Membership{}, targetErr
	}
	role, err := lockOrganizationAccess(ctx, tx, actorID, params.OrganizationID)
	if err != nil {
		return accounts.Membership{}, err
	}
	if role != accounts.Owner {
		return accounts.Membership{}, accounts.ErrForbidden
	}
	// Preserve authorization before disclosing whether a target account exists.
	if targetErr != nil {
		return accounts.Membership{}, targetErr
	}
	if err := checkUserOrganizationQuota(ctx, tx, params.UserID); err != nil {
		return accounts.Membership{}, err
	}
	if err := checkResourceQuota(
		ctx,
		tx,
		params.OrganizationID,
		"members",
	); err != nil {
		return accounts.Membership{}, err
	}
	var member accounts.Membership
	err = scanMembership(tx.QueryRow(ctx, `INSERT INTO memberships (organization_id, user_id, role)
		VALUES ($1,$2,$3) ON CONFLICT (organization_id, user_id) DO NOTHING
		RETURNING organization_id, user_id, role, created_at, updated_at`,
		params.OrganizationID, params.UserID, params.Role), &member)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.Membership{}, accounts.ErrAlreadyMember
	}
	if err != nil {
		return accounts.Membership{}, fmt.Errorf("add organization member: %w", err)
	}
	if err := completeOnboarding(ctx, tx, params.UserID); err != nil {
		return accounts.Membership{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return accounts.Membership{}, fmt.Errorf("commit membership creation: %w", err)
	}
	return member, nil
}

func (s *Store) ChangeMembershipRole(
	ctx context.Context,
	actorID uuid.UUID,
	params MembershipParams,
) (accounts.Membership, error) {
	if !params.Role.Valid() {
		return accounts.Membership{}, accounts.ErrInvalidRole
	}
	organization, err := s.GetOrganization(ctx, actorID, params.OrganizationID)
	if err != nil {
		return accounts.Membership{}, err
	}
	if organization.Role != accounts.Owner {
		return accounts.Membership{}, accounts.ErrForbidden
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return accounts.Membership{}, fmt.Errorf("begin membership update: %w", err)
	}
	defer rollbackTransaction(tx)
	targetErr := lockActiveUsers(
		ctx,
		tx,
		actorID,
		params.UserID,
	)
	if targetErr != nil && !errors.Is(targetErr, accounts.ErrUserNotFound) {
		return accounts.Membership{}, targetErr
	}
	role, err := lockOrganizationAccess(ctx, tx, actorID, params.OrganizationID)
	if err != nil {
		return accounts.Membership{}, err
	}
	if role != accounts.Owner {
		return accounts.Membership{}, accounts.ErrForbidden
	}
	if targetErr != nil {
		return accounts.Membership{}, targetErr
	}
	if params.Role != accounts.Owner {
		if err := retainOrganizationOwner(ctx, tx, params.OrganizationID, params.UserID); err != nil {
			return accounts.Membership{}, err
		}
	}
	var member accounts.Membership
	err = scanMembership(tx.QueryRow(ctx, `UPDATE memberships SET role = $3, updated_at = clock_timestamp()
		WHERE organization_id = $1 AND user_id = $2
		RETURNING organization_id, user_id, role, created_at, updated_at`,
		params.OrganizationID, params.UserID, params.Role), &member)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.Membership{}, accounts.ErrMemberNotFound
	}
	if err != nil {
		return accounts.Membership{}, fmt.Errorf("update organization member: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return accounts.Membership{}, fmt.Errorf("commit membership update: %w", err)
	}
	return member, nil
}

func (s *Store) RemoveMembership(ctx context.Context, actorID, organizationID, userID uuid.UUID) error {
	organization, err := s.GetOrganization(ctx, actorID, organizationID)
	if err != nil {
		return err
	}
	if organization.Role != accounts.Owner && actorID != userID {
		return accounts.ErrForbidden
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin membership removal: %w", err)
	}
	defer rollbackTransaction(tx)
	targetErr := lockActiveUsers(
		ctx,
		tx,
		actorID,
		userID,
	)
	if targetErr != nil && !errors.Is(targetErr, accounts.ErrUserNotFound) {
		return targetErr
	}
	role, err := lockOrganizationAccess(ctx, tx, actorID, organizationID)
	if err != nil {
		return err
	}
	if role != accounts.Owner && actorID != userID {
		return accounts.ErrForbidden
	}
	if targetErr != nil {
		return targetErr
	}
	if err := retainOrganizationOwner(ctx, tx, organizationID, userID); err != nil {
		return err
	}
	result, err := tx.Exec(ctx, `DELETE FROM memberships WHERE organization_id = $1 AND user_id = $2`,
		organizationID, userID)
	if err != nil {
		return fmt.Errorf("remove organization member: %w", err)
	}
	if result.RowsAffected() == 0 {
		return accounts.ErrMemberNotFound
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit membership removal: %w", err)
	}
	return nil
}

// The organization lock serializes every role change/removal, including two
// owners trying to demote or remove each other concurrently.
func retainOrganizationOwner(ctx context.Context, tx pgx.Tx, organizationID, userID uuid.UUID) error {
	var role accounts.Role
	err := tx.QueryRow(ctx, `SELECT role FROM memberships WHERE organization_id = $1 AND user_id = $2`,
		organizationID, userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.ErrMemberNotFound
	}
	if err != nil {
		return fmt.Errorf("read target membership: %w", err)
	}
	if role != accounts.Owner {
		return nil
	}
	var anotherOwner bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
		WHERE m.organization_id = $1 AND m.user_id <> $2 AND m.role = 'owner' AND u.deletion_requested_at IS NULL)`,
		organizationID, userID).Scan(&anotherOwner)
	if err != nil {
		return fmt.Errorf("check remaining organization owners: %w", err)
	}
	if !anotherOwner {
		return accounts.ErrLastOwner
	}
	return nil
}

func scanMembership(row pgx.Row, member *accounts.Membership) error {
	return row.Scan(
		&member.OrganizationID,
		&member.UserID,
		&member.Role,
		&member.CreatedAt,
		&member.UpdatedAt,
	)
}
