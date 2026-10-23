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

func (s *Store) GetProject(ctx context.Context, userID, id uuid.UUID) (accounts.Project, error) {
	var project accounts.Project
	err := scanProject(s.pool.QueryRow(ctx, `SELECT p.id, p.organization_id, p.name, m.role, p.created_at, p.updated_at
		FROM projects p JOIN memberships m ON m.organization_id = p.organization_id
		JOIN organizations o ON o.id = p.organization_id JOIN users u ON u.id = m.user_id
		WHERE p.id = $1 AND m.user_id = $2 AND p.deletion_requested_at IS NULL
		AND o.deletion_requested_at IS NULL AND u.deletion_requested_at IS NULL`, id, userID), &project)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.Project{}, accounts.ErrNotFound
	}
	if err != nil {
		return accounts.Project{}, fmt.Errorf("get account project: %w", err)
	}
	return project, nil
}

func (s *Store) ListProjects(
	ctx context.Context,
	userID, organizationID uuid.UUID,
	options pagination.Options,
) ([]accounts.Project, error) {
	if err := options.Validate(); err != nil {
		return nil, err
	}
	if _, err := s.GetOrganization(ctx, userID, organizationID); err != nil {
		return nil, err
	}
	query := `SELECT p.id, p.organization_id, p.name, m.role, p.created_at, p.updated_at
		FROM projects p JOIN memberships m ON m.organization_id = p.organization_id
		JOIN organizations o ON o.id = p.organization_id JOIN users u ON u.id = m.user_id
		WHERE p.organization_id = $1 AND m.user_id = $2 AND p.deletion_requested_at IS NULL
		AND o.deletion_requested_at IS NULL AND u.deletion_requested_at IS NULL`
	args := []any{organizationID, userID}
	if options.Before != nil {
		args = append(args, options.Before.CreatedAt, options.Before.ID)
		query += ` AND (p.created_at, p.id) < ($3, $4)`
	}
	args = append(args, options.Limit+1)
	query += fmt.Sprintf(` ORDER BY p.created_at DESC, p.id DESC LIMIT $%d`, len(args))
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list organization projects: %w", err)
	}
	result, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (accounts.Project, error) {
		var project accounts.Project
		err := scanProject(row, &project)
		return project, err
	})
	if err != nil {
		return nil, fmt.Errorf("read organization projects: %w", err)
	}
	return result, nil
}

type CreateProjectParams struct {
	OrganizationID uuid.UUID
	Name           string
}

func (s *Store) CreateProject(
	ctx context.Context,
	userID uuid.UUID,
	params CreateProjectParams,
) (accounts.Project, error) {
	name, err := accounts.NormalizeName(params.Name)
	if err != nil {
		return accounts.Project{}, err
	}
	id, err := uuid.NewV7()
	if err != nil {
		return accounts.Project{}, fmt.Errorf("generate project ID: %w", err)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return accounts.Project{}, fmt.Errorf("begin project creation: %w", err)
	}
	defer rollbackTransaction(tx)
	role, err := lockOrganizationAccess(ctx, tx, userID, params.OrganizationID)
	if err != nil {
		return accounts.Project{}, err
	}
	if !role.CanManageProjects() {
		return accounts.Project{}, accounts.ErrForbidden
	}
	if err := checkResourceQuota(
		ctx,
		tx,
		params.OrganizationID,
		"projects",
	); err != nil {
		return accounts.Project{}, err
	}
	project := accounts.Project{ID: id, OrganizationID: params.OrganizationID, Name: name, Role: role}
	err = tx.QueryRow(ctx, `INSERT INTO projects (id, organization_id, name) VALUES ($1,$2,$3)
		RETURNING created_at, updated_at`, id, params.OrganizationID, name,
	).Scan(&project.CreatedAt, &project.UpdatedAt)
	if err != nil {
		return accounts.Project{}, fmt.Errorf("create organization project: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return accounts.Project{}, fmt.Errorf("commit project creation: %w", err)
	}
	return project, nil
}

func (s *Store) RenameProject(ctx context.Context, userID, id uuid.UUID, name string) (accounts.Project, error) {
	name, err := accounts.NormalizeName(name)
	if err != nil {
		return accounts.Project{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return accounts.Project{}, fmt.Errorf("begin project update: %w", err)
	}
	defer rollbackTransaction(tx)
	role, err := lockHumanProjectAccess(ctx, tx, auth.Principal{ProjectID: id, UserID: userID})
	if err != nil {
		return accounts.Project{}, err
	}
	project := accounts.Project{Role: role}
	err = tx.QueryRow(ctx, `UPDATE projects SET name = $2, updated_at = clock_timestamp()
		WHERE id = $1 AND deletion_requested_at IS NULL
		RETURNING id, organization_id, name, created_at, updated_at`, id, name,
	).Scan(&project.ID, &project.OrganizationID, &project.Name, &project.CreatedAt, &project.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.Project{}, accounts.ErrNotFound
	}
	if err != nil {
		return accounts.Project{}, fmt.Errorf("rename project: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return accounts.Project{}, fmt.Errorf("commit project update: %w", err)
	}
	return project, nil
}

// Human mutations hold the active user, then the organization, before project
// or child locks. Account deletion and membership changes take the exclusive
// counterparts, preventing a removed/deleted actor from passing the recheck.
func lockHumanProjectAccess(ctx context.Context, tx pgx.Tx, actor auth.Principal) (accounts.Role, error) {
	if !actor.Valid() || actor.UserID == uuid.Nil {
		return "", accounts.ErrForbidden
	}
	if err := lockActiveUsers(ctx, tx, actor.UserID); err != nil {
		if errors.Is(err, accounts.ErrUserNotFound) {
			return "", accounts.ErrAccountDeleted
		}
		return "", err
	}
	var organizationID uuid.UUID
	err := tx.QueryRow(ctx, `SELECT organization_id FROM projects WHERE id = $1`, actor.ProjectID).Scan(&organizationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", accounts.ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("find project organization: %w", err)
	}
	var id uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM organizations
		WHERE id = $1 AND deletion_requested_at IS NULL FOR SHARE`, organizationID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", accounts.ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("lock project organization access: %w", err)
	}
	role, err := organizationRole(ctx, tx, actor.UserID, organizationID)
	if err != nil {
		return "", err
	}
	if !role.CanManageProjects() {
		return "", accounts.ErrForbidden
	}
	return role, nil
}

func scanProject(row pgx.Row, project *accounts.Project) error {
	return row.Scan(
		&project.ID,
		&project.OrganizationID,
		&project.Name,
		&project.Role,
		&project.CreatedAt,
		&project.UpdatedAt,
	)
}
