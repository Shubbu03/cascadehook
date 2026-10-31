package store

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/controls"
	"cascadehook/internal/notifications"
	"cascadehook/internal/pagination"
)

const projectStateColumns = `id, suspended_at IS NOT NULL, suspended_at, suspension_reason, control_version`

func scanProjectState(row pgx.Row, state *controls.ProjectState) error {
	return row.Scan(
		&state.ProjectID,
		&state.Suspended,
		&state.SuspendedAt,
		&state.Reason,
		&state.Version,
	)
}

func (s *Store) GetProjectState(ctx context.Context, projectID uuid.UUID) (controls.ProjectState, error) {
	var state controls.ProjectState
	err := scanProjectState(s.pool.QueryRow(ctx, `SELECT `+projectStateColumns+`
		FROM projects WHERE id = $1 AND deletion_requested_at IS NULL
		AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = projects.organization_id AND o.deletion_requested_at IS NULL)`,
		projectID), &state)
	if errors.Is(err, pgx.ErrNoRows) {
		return controls.ProjectState{}, controls.ErrProjectNotFound
	}
	if err != nil {
		return controls.ProjectState{}, fmt.Errorf("get project control state: %w", err)
	}
	return state, nil
}

type ProjectControlResult struct {
	State   controls.ProjectState `json:"state"`
	Changed bool                  `json:"changed"`
}

func (s *Store) ChangeProjectControl(
	ctx context.Context,
	change controls.ProjectChange,
) (ProjectControlResult, error) {
	if err := change.Validate(); err != nil {
		return ProjectControlResult{}, err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return ProjectControlResult{}, fmt.Errorf("begin project control change: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockProjectOrganization(ctx, tx, change.ProjectID); err != nil {
		return ProjectControlResult{}, err
	}
	var state controls.ProjectState
	err = scanProjectState(tx.QueryRow(ctx, `SELECT `+projectStateColumns+`
		FROM projects WHERE id = $1 AND deletion_requested_at IS NULL
		AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = projects.organization_id AND o.deletion_requested_at IS NULL)
		FOR UPDATE`,
		change.ProjectID), &state)
	if errors.Is(err, pgx.ErrNoRows) {
		return ProjectControlResult{}, controls.ErrProjectNotFound
	}
	if err != nil {
		return ProjectControlResult{}, fmt.Errorf("lock project control state: %w", err)
	}
	if state.Version != change.ExpectedVersion {
		return ProjectControlResult{}, controls.ErrVersionChanged
	}
	sameReason := state.Reason != nil && *state.Reason == change.Reason
	if state.Suspended == change.Suspended && (!change.Suspended || sameReason) {
		return ProjectControlResult{State: state}, nil
	}
	if state.Version == math.MaxInt64 {
		return ProjectControlResult{}, controls.ErrVersionLimit
	}
	var databaseNow time.Time
	if err := tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&databaseNow); err != nil {
		return ProjectControlResult{}, fmt.Errorf("read project control database time: %w", err)
	}
	var suspendedAt *time.Time
	var reason *string
	action := "resume"
	if change.Suspended {
		suspendedAt, reason = &databaseNow, &change.Reason
		action = "suspend"
	}
	err = scanProjectState(tx.QueryRow(
		ctx,
		`UPDATE projects SET suspended_at = $2, suspension_reason = $3,
		control_version = control_version + 1, updated_at = $4 WHERE id = $1 RETURNING `+projectStateColumns,
		change.ProjectID,
		suspendedAt,
		reason,
		databaseNow,
	), &state)
	if err != nil {
		return ProjectControlResult{}, fmt.Errorf("change project control state: %w", err)
	}
	id, err := uuid.NewV7()
	if err != nil {
		return ProjectControlResult{}, fmt.Errorf("generate project control audit ID: %w", err)
	}
	_, err = tx.Exec(
		ctx,
		`INSERT INTO project_control_actions (id, project_id, action, reason, operator_label, control_version, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		id,
		change.ProjectID,
		action,
		change.Reason,
		change.OperatorLabel,
		state.Version,
		databaseNow,
	)
	if err != nil {
		return ProjectControlResult{}, fmt.Errorf("record project control audit: %w", err)
	}
	title, body, severity := "Project resumed", "Event publishing and delivery are available again.", "success"
	if change.Suspended {
		title, body, severity = "Project paused", "Event publishing and delivery have been paused for this project.", "warning"
	}
	if _, err := emitNotification(ctx, tx, notificationEvent{
		ProjectID: change.ProjectID, Type: "project_" + action, Category: notifications.Project,
		Severity: severity, Audience: "manager", Title: title, Body: body,
		ResourceType: "project", ResourceID: change.ProjectID,
		SourceKey: fmt.Sprintf("project:%s:control:%d", change.ProjectID, state.Version),
	}); err != nil {
		return ProjectControlResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ProjectControlResult{}, fmt.Errorf("commit project control change; read status before retrying: %w", err)
	}
	return ProjectControlResult{State: state, Changed: true}, nil
}

func (s *Store) ListProjectControlActions(
	ctx context.Context,
	projectID uuid.UUID,
	limit int,
) ([]controls.ProjectAction, error) {
	if limit < 1 || limit > pagination.MaxLimit {
		return nil, fmt.Errorf("history limit must be between 1 and %d", pagination.MaxLimit)
	}
	if _, err := s.GetProjectState(ctx, projectID); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(
		ctx,
		`SELECT id, project_id, action, reason, operator_label, control_version, created_at
		FROM project_control_actions WHERE project_id = $1 ORDER BY control_version DESC LIMIT $2`,
		projectID,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("list project control audit: %w", err)
	}
	result, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (controls.ProjectAction, error) {
		var action controls.ProjectAction
		err := row.Scan(
			&action.ID,
			&action.ProjectID,
			&action.Action,
			&action.Reason,
			&action.OperatorLabel,
			&action.Version,
			&action.CreatedAt,
		)
		return action, err
	})
	if err != nil {
		return nil, fmt.Errorf("read project control audit: %w", err)
	}
	return result, nil
}

// Take the project lock before endpoint/delivery child locks. Suspension and
// deletion take the exclusive counterpart to order acceptance/dispatch writes.
func lockProjectSuspension(ctx context.Context, tx pgx.Tx, projectID uuid.UUID) (bool, error) {
	if err := lockProjectOrganization(ctx, tx, projectID); err != nil {
		return false, err
	}
	var suspended bool
	err := tx.QueryRow(ctx, `SELECT suspended_at IS NOT NULL FROM projects
		WHERE id = $1 AND deletion_requested_at IS NULL
		AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = projects.organization_id AND o.deletion_requested_at IS NULL)
		FOR SHARE`,
		projectID).Scan(&suspended)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, controls.ErrProjectNotFound
	}
	if err != nil {
		return false, fmt.Errorf("lock project suspension state: %w", err)
	}
	return suspended, nil
}

// Callers already hold the project row lock for a configuration/credential
// mutation. This check acquires no parent lock after a child has been locked.
func requireActiveProject(ctx context.Context, tx pgx.Tx, projectID uuid.UUID) error {
	var suspended bool
	err := tx.QueryRow(ctx, `SELECT suspended_at IS NOT NULL FROM projects
		WHERE id = $1 AND deletion_requested_at IS NULL
		AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = projects.organization_id AND o.deletion_requested_at IS NULL)`,
		projectID).Scan(&suspended)
	if errors.Is(err, pgx.ErrNoRows) {
		return controls.ErrProjectNotFound
	}
	if err != nil {
		return fmt.Errorf("check locked project suspension: %w", err)
	}
	if suspended {
		return controls.ErrSuspended
	}
	return nil
}
