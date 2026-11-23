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
	// Opt-in is checked at creation and again before sending. Existing inbox
	// history is never mailed when a user first enables email notifications.
	rows, err := tx.Query(ctx, `SELECT r.user_id
		FROM notification_recipients r JOIN notification_preferences prefs ON prefs.user_id=r.user_id
		LEFT JOIN organization_notification_preferences op ON op.user_id=r.user_id AND op.organization_id=r.organization_id
		LEFT JOIN project_notification_preferences pp ON pp.user_id=r.user_id AND pp.project_id=$3
		WHERE r.notification_id=$1 AND prefs.email_enabled AND $2=ANY(prefs.email_categories)
		AND coalesce(pp.email_enabled,true) AND coalesce(op.email_enabled,true)
		AND $4=ANY(prefs.email_severities) AND $5::text `+notificationEmailTypeFilter,
		id, event.Category, nullableUUID(event.ProjectID), event.Severity, event.Type)
	if err != nil {
		return uuid.Nil, fmt.Errorf("select notification email recipients: %w", err)
	}
	recipients, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
	if err != nil {
		return uuid.Nil, fmt.Errorf("read notification email recipients: %w", err)
	}
	if len(recipients) == 0 {
		return id, nil
	}
	jobIDs := make([]uuid.UUID, len(recipients))
	for i := range jobIDs {
		if jobIDs[i], err = uuid.NewV7(); err != nil {
			return uuid.Nil, fmt.Errorf("generate notification email ID: %w", err)
		}
	}
	_, err = tx.Exec(ctx, `INSERT INTO email_outbox
		(id,organization_id,created_by_user_id,notification_id,recipient_user_id)
		SELECT jobs.id,$1,jobs.user_id,$2,jobs.user_id
		FROM unnest($3::uuid[],$4::uuid[]) AS jobs(id,user_id)`,
		event.OrganizationID, id, jobIDs, recipients)
	if err != nil {
		return uuid.Nil, fmt.Errorf("queue notification emails: %w", err)
	}
	return id, nil
}
