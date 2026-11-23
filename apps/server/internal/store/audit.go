package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/accounts"
	"cascadehook/internal/auth"
	"cascadehook/internal/pagination"
)

const AuditRetentionDays = 90

type AuditEntry struct {
	ID            uuid.UUID               `json:"id"`
	ProjectID     *uuid.UUID              `json:"project_id"`
	ActorUserID   *uuid.UUID              `json:"actor_user_id"`
	ActorAPIKeyID *uuid.UUID              `json:"actor_api_key_id"`
	Action        string                  `json:"action"`
	TargetType    string                  `json:"target_type"`
	TargetID      uuid.UUID               `json:"target_id"`
	ChangedFields []string                `json:"changed_fields"`
	CreatedAt     time.Time               `json:"created_at"`
	ActorProfile  *accounts.MemberProfile `json:"actor_profile,omitempty"`
}

func setAuditActor(ctx context.Context, tx pgx.Tx, actor auth.Principal) error {
	userID, keyID := "", ""
	if actor.UserID != uuid.Nil {
		userID = actor.UserID.String()
	}
	if actor.APIKeyID != uuid.Nil {
		keyID = actor.APIKeyID.String()
	}
	_, err := tx.Exec(ctx, `SELECT set_config('cascadehook.actor_user_id',$1,true),
		set_config('cascadehook.actor_api_key_id',$2,true)`, userID, keyID)
	if err != nil {
		return fmt.Errorf("set audit actor: %w", err)
	}
	return nil
}

func (s *Store) AuditActors(ctx context.Context, organizationID uuid.UUID, ids []uuid.UUID) ([]accounts.Membership, error) {
	if len(ids) == 0 {
		return []accounts.Membership{}, nil
	}
	rows, err := s.pool.Query(ctx, `SELECT u.id,u.identity_issuer,u.identity_subject FROM users u
		JOIN memberships m ON m.user_id=u.id WHERE m.organization_id=$1 AND u.id=ANY($2::uuid[])
		AND u.deletion_requested_at IS NULL`, organizationID, ids)
	if err != nil {
		return nil, fmt.Errorf("select audit actors: %w", err)
	}
	actors, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (accounts.Membership, error) {
		var actor accounts.Membership
		err := row.Scan(&actor.UserID, &actor.IdentityIssuer, &actor.IdentitySubject)
		return actor, err
	})
	if err != nil {
		return nil, fmt.Errorf("read audit actors: %w", err)
	}
	return actors, nil
}

func (s *Store) ListAuditEntries(
	ctx context.Context,
	userID, organizationID uuid.UUID,
	projectID *uuid.UUID,
	options pagination.Options,
) ([]AuditEntry, error) {
	if err := options.Validate(); err != nil {
		return nil, err
	}
	organization, err := s.GetOrganization(ctx, userID, organizationID)
	if err != nil {
		return nil, err
	}
	if !organization.Role.CanManageProjects() {
		return nil, accounts.ErrForbidden
	}
	if projectID != nil {
		project, err := s.GetProject(ctx, userID, *projectID)
		if err != nil {
			return nil, err
		}
		if project.OrganizationID != organizationID {
			return nil, accounts.ErrNotFound
		}
	}
	var beforeAt *time.Time
	var beforeID *uuid.UUID
	if options.Before != nil {
		beforeAt = &options.Before.CreatedAt
		beforeID = &options.Before.ID
	}
	rows, err := s.pool.Query(ctx, `SELECT id,project_id,actor_user_id,actor_api_key_id,action,target_type,
		target_id,changed_fields,created_at FROM audit_entries WHERE organization_id=$1
		AND ($2::uuid IS NULL OR project_id=$2) AND created_at>clock_timestamp()-make_interval(days => $6)
		AND ($3::timestamptz IS NULL OR (created_at,id)<($3,$4))
		ORDER BY created_at DESC,id DESC LIMIT $5`, organizationID, projectID, beforeAt, beforeID, options.Limit+1,
		AuditRetentionDays)
	if err != nil {
		return nil, fmt.Errorf("select audit entries: %w", err)
	}
	entries, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (AuditEntry, error) {
		var entry AuditEntry
		err := row.Scan(&entry.ID, &entry.ProjectID, &entry.ActorUserID, &entry.ActorAPIKeyID, &entry.Action,
			&entry.TargetType, &entry.TargetID, &entry.ChangedFields, &entry.CreatedAt)
		return entry, err
	})
	if err != nil {
		return nil, fmt.Errorf("read audit entries: %w", err)
	}
	return entries, nil
}
