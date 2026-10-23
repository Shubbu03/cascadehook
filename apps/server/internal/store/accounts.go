package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/accounts"
	"cascadehook/internal/auth"
	"cascadehook/internal/pagination"
)

func (s *Store) EnsureUser(ctx context.Context, identity auth.SessionIdentity) (accounts.User, error) {
	var user accounts.User
	err := s.pool.QueryRow(ctx, `SELECT id, created_at, deletion_requested_at FROM users
		WHERE identity_issuer = $1 AND identity_subject = $2`, identity.Issuer, identity.Subject,
	).Scan(&user.ID, &user.CreatedAt, &user.DeletionRequestedAt)
	if err == nil {
		return user, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return accounts.User{}, fmt.Errorf("find account identity: %w", err)
	}
	id, err := uuid.NewV7()
	if err != nil {
		return accounts.User{}, fmt.Errorf("generate user ID: %w", err)
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return accounts.User{}, fmt.Errorf("begin identity provisioning: %w", err)
	}
	defer rollbackTransaction(tx)
	digest := auth.IdentityDigest(identity)
	if err := lockIdentity(ctx, tx, digest); err != nil {
		return accounts.User{}, err
	}
	var suppressed bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM deleted_account_identities WHERE identity_hash = $1)`,
		digest[:]).Scan(&suppressed); err != nil {
		return accounts.User{}, fmt.Errorf("check identity suppression: %w", err)
	}
	if suppressed {
		return accounts.User{}, accounts.ErrAccountDeleted
	}
	// Provisioning and deletion serialize on the identity. An old request
	// cannot recreate the account after the janitor removes its user row.
	err = tx.QueryRow(ctx, `INSERT INTO users (id, identity_issuer, identity_subject)
		VALUES ($1,$2,$3) ON CONFLICT (identity_issuer, identity_subject)
		DO UPDATE SET identity_subject = EXCLUDED.identity_subject RETURNING id, created_at, deletion_requested_at`,
		id, identity.Issuer, identity.Subject,
	).Scan(&user.ID, &user.CreatedAt, &user.DeletionRequestedAt)
	if err != nil {
		return accounts.User{}, fmt.Errorf("provision account identity: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return accounts.User{}, fmt.Errorf("commit identity provisioning: %w", err)
	}
	return user, nil
}

func (s *Store) GetOrganization(ctx context.Context, userID, id uuid.UUID) (accounts.Organization, error) {
	var organization accounts.Organization
	err := scanOrganization(s.pool.QueryRow(ctx, `SELECT o.id, o.name, m.role, o.created_at, o.updated_at
		FROM organizations o JOIN memberships m ON m.organization_id = o.id JOIN users u ON u.id = m.user_id
		WHERE o.id = $1 AND m.user_id = $2 AND o.deletion_requested_at IS NULL
		AND u.deletion_requested_at IS NULL`, id, userID), &organization)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.Organization{}, accounts.ErrNotFound
	}
	if err != nil {
		return accounts.Organization{}, fmt.Errorf("get organization: %w", err)
	}
	return organization, nil
}

func (s *Store) ListOrganizations(
	ctx context.Context,
	userID uuid.UUID,
	options pagination.Options,
) ([]accounts.Organization, error) {
	if err := options.Validate(); err != nil {
		return nil, err
	}
	query := `SELECT o.id, o.name, m.role, o.created_at, o.updated_at
		FROM organizations o JOIN memberships m ON m.organization_id = o.id JOIN users u ON u.id = m.user_id
		WHERE m.user_id = $1 AND o.deletion_requested_at IS NULL AND u.deletion_requested_at IS NULL`
	args := []any{userID}
	if options.Before != nil {
		args = append(args, options.Before.CreatedAt, options.Before.ID)
		query += ` AND (o.created_at, o.id) < ($2, $3)`
	}
	args = append(args, options.Limit+1)
	query += fmt.Sprintf(` ORDER BY o.created_at DESC, o.id DESC LIMIT $%d`, len(args))
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list organizations: %w", err)
	}
	result, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (accounts.Organization, error) {
		var organization accounts.Organization
		err := scanOrganization(row, &organization)
		return organization, err
	})
	if err != nil {
		return nil, fmt.Errorf("read organizations: %w", err)
	}
	return result, nil
}

func scanOrganization(row pgx.Row, organization *accounts.Organization) error {
	return row.Scan(
		&organization.ID,
		&organization.Name,
		&organization.Role,
		&organization.CreatedAt,
		&organization.UpdatedAt,
	)
}

func (s *Store) CreateOrganization(ctx context.Context, userID uuid.UUID, name string) (accounts.Organization, error) {
	name, err := accounts.NormalizeName(name)
	if err != nil {
		return accounts.Organization{}, err
	}
	id, err := uuid.NewV7()
	if err != nil {
		return accounts.Organization{}, fmt.Errorf("generate organization ID: %w", err)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return accounts.Organization{}, fmt.Errorf("begin organization creation: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockActiveUsers(ctx, tx, userID); err != nil {
		return accounts.Organization{}, err
	}
	organization := accounts.Organization{ID: id, Name: name, Role: accounts.Owner}
	err = tx.QueryRow(ctx, `INSERT INTO organizations (id, name) VALUES ($1, $2)
		RETURNING created_at, updated_at`, id, name).Scan(&organization.CreatedAt, &organization.UpdatedAt)
	if err != nil {
		return accounts.Organization{}, fmt.Errorf("create organization: %w", err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
		id, userID)
	if err != nil {
		return accounts.Organization{}, fmt.Errorf("create organization owner: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return accounts.Organization{}, fmt.Errorf("commit organization creation: %w", err)
	}
	return organization, nil
}

func (s *Store) RenameOrganization(
	ctx context.Context,
	userID, id uuid.UUID,
	name string,
) (accounts.Organization, error) {
	name, err := accounts.NormalizeName(name)
	if err != nil {
		return accounts.Organization{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return accounts.Organization{}, fmt.Errorf("begin organization update: %w", err)
	}
	defer rollbackTransaction(tx)
	role, err := lockOrganizationAccess(ctx, tx, userID, id)
	if err != nil {
		return accounts.Organization{}, err
	}
	if role != accounts.Owner {
		return accounts.Organization{}, accounts.ErrForbidden
	}
	organization := accounts.Organization{Role: role}
	err = tx.QueryRow(ctx, `UPDATE organizations SET name = $2, updated_at = clock_timestamp()
		WHERE id = $1 RETURNING id, name, created_at, updated_at`, id, name,
	).Scan(&organization.ID, &organization.Name, &organization.CreatedAt, &organization.UpdatedAt)
	if err != nil {
		return accounts.Organization{}, fmt.Errorf("rename organization: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return accounts.Organization{}, fmt.Errorf("commit organization update: %w", err)
	}
	return organization, nil
}

// Active-user locks precede organization writes. A separate query after the
// parent lock observes role changes committed while that lock waited.
func lockOrganizationAccess(
	ctx context.Context,
	tx pgx.Tx,
	userID, organizationID uuid.UUID,
) (accounts.Role, error) {
	if err := lockActiveUsers(ctx, tx, userID); err != nil {
		return "", err
	}
	var id uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM organizations
		WHERE id = $1 AND deletion_requested_at IS NULL FOR UPDATE`, organizationID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", accounts.ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("lock organization: %w", err)
	}
	return organizationRole(ctx, tx, userID, organizationID)
}

func organizationRole(ctx context.Context, tx pgx.Tx, userID, organizationID uuid.UUID) (accounts.Role, error) {
	var role accounts.Role
	err := tx.QueryRow(ctx, `SELECT m.role FROM memberships m JOIN users u ON u.id = m.user_id
		WHERE m.organization_id = $1 AND m.user_id = $2 AND u.deletion_requested_at IS NULL`,
		organizationID, userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", accounts.ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("check organization membership: %w", err)
	}
	return role, nil
}
