package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/notifications"
)

type notificationEvent struct {
	ID                                            uuid.UUID
	OrganizationID, ProjectID, ActorID, SubjectID uuid.UUID
	Type, Severity, Title, Body                   string
	Category                                      notifications.Category
	ResourceType, SourceKey                       string
	ResourceID                                    uuid.UUID
	Audience                                      string
}

// Call inside the source mutation's transaction, after organization/project
// locks. Recipients are selected once; reads independently check current access.
func emitNotification(ctx context.Context, tx pgx.Tx, event notificationEvent) (uuid.UUID, error) {
	validAudience := event.Audience == "owner" || event.Audience == "manager" || event.Audience == "member"
	if !validAudience {
		return uuid.Nil, fmt.Errorf("invalid notification audience")
	}
	if event.OrganizationID == uuid.Nil {
		if err := tx.QueryRow(ctx, `SELECT organization_id FROM projects WHERE id = $1`,
			event.ProjectID).Scan(&event.OrganizationID); err != nil {
			return uuid.Nil, fmt.Errorf("find notification organization: %w", err)
		}
	}
	id := event.ID
	if id == uuid.Nil {
		var err error
		id, err = uuid.NewV7()
		if err != nil {
			return uuid.Nil, fmt.Errorf("generate notification ID: %w", err)
		}
	}
	if event.SourceKey == "" {
		event.SourceKey = event.Type + ":" + id.String()
	}
	err := tx.QueryRow(ctx, `INSERT INTO notifications
		(id, organization_id, project_id, type, category, severity, title, body,
		resource_type, resource_id, actor_user_id, source_key)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		ON CONFLICT (organization_id, source_key) DO NOTHING RETURNING id`,
		id, event.OrganizationID, nullableUUID(event.ProjectID), event.Type, event.Category,
		event.Severity, event.Title, event.Body, event.ResourceType, nullableUUID(event.ResourceID),
		nullableUUID(event.ActorID), event.SourceKey).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		// An existing event never gains recipients who joined after it happened.
		return uuid.Nil, nil
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("create notification: %w", err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO notification_recipients
		(organization_id, notification_id, user_id, membership_created_at, required_role)
		SELECT m.organization_id,$2,m.user_id,m.created_at,
		CASE WHEN m.user_id = $4 THEN 'member' ELSE $5 END
		FROM memberships m JOIN users u ON u.id = m.user_id
		WHERE m.organization_id = $1 AND u.deletion_requested_at IS NULL
		AND ($3::uuid IS NULL OR m.user_id <> $3)
		AND ($5 = 'member' OR m.role = 'owner' OR ($5 = 'manager' AND m.role = 'admin') OR m.user_id = $4)`,
		event.OrganizationID, id, nullableUUID(event.ActorID), nullableUUID(event.SubjectID), event.Audience)
	if err != nil {
		return uuid.Nil, fmt.Errorf("create notification recipients: %w", err)
	}
	return id, nil
}
