package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/deliveries"
	"cascadehook/internal/notifications"
)

// Only terminal failed cycles open/increment an incident. Automatic retries do
// not create inbox noise. Read/archive state is independent of incident state.
func notifyDeliveryCompletion(ctx context.Context, tx pgx.Tx, held lockedDelivery, completion deliveries.Completion) error {
	if held.Deleted {
		return nil
	}
	switch completion.State {
	case deliveries.Failed:
		return notifyFailedDelivery(ctx, tx, held)
	case deliveries.Succeeded:
		return notifyDeliveryRecovery(ctx, tx, held)
	default:
		return nil
	}
}

func notifyFailedDelivery(ctx context.Context, tx pgx.Tx, held lockedDelivery) error {
	id, err := uuid.NewV7()
	if err != nil {
		return fmt.Errorf("generate delivery incident ID: %w", err)
	}
	var count int64
	err = tx.QueryRow(ctx, `INSERT INTO notification_delivery_state AS s
		(endpoint_id,project_id,organization_id,notification_id,failure_count,last_failure_at)
		SELECT $1,p.id,p.organization_id,$3,1,$4 FROM projects p WHERE p.id = $2
		ON CONFLICT (endpoint_id) DO UPDATE SET
		notification_id = CASE WHEN s.recovered_at IS NOT NULL
			OR NOT EXISTS (SELECT 1 FROM notifications n WHERE n.id = s.notification_id) THEN EXCLUDED.notification_id ELSE s.notification_id END,
		failure_count = CASE WHEN s.recovered_at IS NOT NULL
			OR NOT EXISTS (SELECT 1 FROM notifications n WHERE n.id = s.notification_id) THEN 1 ELSE least(s.failure_count,9223372036854775806) + 1 END,
		last_failure_at = greatest(s.last_failure_at,EXCLUDED.last_failure_at),recovered_at = NULL
		RETURNING notification_id,failure_count`, held.EndpointID, held.ProjectID, id, held.Now).Scan(&id, &count)
	if err != nil {
		return fmt.Errorf("record delivery notification incident: %w", err)
	}
	if _, err := emitNotification(ctx, tx, notificationEvent{
		ID: id, ProjectID: held.ProjectID, Type: "delivery_failed", Category: notifications.Delivery,
		Severity: "error", Audience: "manager", Title: "Deliveries failed for an endpoint",
		Body:         "One or more delivery cycles ended in failure. Inspect this endpoint's deliveries before replaying.",
		ResourceType: "endpoint", ResourceID: held.EndpointID, SourceKey: "delivery:incident:" + id.String(),
	}); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE notifications SET occurrence_count = $2 WHERE id = $1`, id, count)
	if err != nil {
		return fmt.Errorf("update grouped delivery notification: %w", err)
	}
	return nil
}

func notifyDeliveryRecovery(ctx context.Context, tx pgx.Tx, held lockedDelivery) error {
	if held.StartedAt == nil {
		return nil
	}
	var id uuid.UUID
	err := tx.QueryRow(ctx, `UPDATE notification_delivery_state SET recovered_at = $3
		WHERE endpoint_id = $1 AND recovered_at IS NULL AND last_failure_at < $2
		RETURNING notification_id`, held.EndpointID, *held.StartedAt, held.Now).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("record delivery notification recovery: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE notifications SET resolved_at = $2 WHERE id = $1`, id, held.Now); err != nil {
		return fmt.Errorf("resolve delivery notification: %w", err)
	}
	_, err = emitNotification(ctx, tx, notificationEvent{
		ProjectID: held.ProjectID, Type: "delivery_recovered", Category: notifications.Delivery,
		Severity: "success", Audience: "manager", Title: "A receiver accepted delivery again",
		Body:         "A request started after the latest recorded failure succeeded. Earlier failed deliveries may still need attention.",
		ResourceType: "endpoint", ResourceID: held.EndpointID, SourceKey: "delivery:incident:" + id.String() + ":recovered",
	})
	return err
}
