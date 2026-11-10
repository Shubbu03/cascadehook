package store

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/controls"
	"cascadehook/internal/notifications"
)

const deliveryRetryWarningDelay = 5 * time.Minute

// Completions already hold delivery child locks. Maintenance takes only parent
// gates and this endpoint gate, then reads deliveries without locking them.
// This serializes warning/recovery decisions without reversing lock order.
func lockDeliveryNotificationState(ctx context.Context, tx pgx.Tx, endpointID uuid.UUID) error {
	key := sha256.Sum256([]byte("delivery-notification:" + endpointID.String()))
	return lockIdentity(ctx, tx, key)
}

func recordDeliveryRetryFailure(ctx context.Context, tx pgx.Tx, held lockedDelivery) error {
	if held.Deleted || !held.Enabled || !held.Verified {
		return nil
	}
	if err := lockDeliveryNotificationState(ctx, tx, held.EndpointID); err != nil {
		return err
	}
	id, err := uuid.NewV7()
	if err != nil {
		return fmt.Errorf("generate delivery retry incident ID: %w", err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO notification_delivery_retry_state AS s
		(endpoint_id,project_id,organization_id,notification_id,first_failure_at,last_failure_at)
		SELECT $1,p.id,p.organization_id,$3,$4,$4 FROM projects p WHERE p.id=$2
		ON CONFLICT(endpoint_id) DO UPDATE SET
		notification_id=CASE WHEN s.recovered_at IS NOT NULL THEN EXCLUDED.notification_id ELSE s.notification_id END,
		first_failure_at=CASE WHEN s.recovered_at IS NOT NULL THEN EXCLUDED.first_failure_at ELSE s.first_failure_at END,
		last_failure_at=greatest(s.last_failure_at,EXCLUDED.last_failure_at),
		warned_at=CASE WHEN s.recovered_at IS NOT NULL THEN NULL ELSE s.warned_at END,recovered_at=NULL
		WHERE s.recovered_at IS NULL OR EXCLUDED.last_failure_at>s.recovered_at`,
		held.EndpointID, held.ProjectID, id, held.Now)
	if err != nil {
		return fmt.Errorf("record delivery retry incident: %w", err)
	}
	return nil
}

const retryWarningJoins = ` FROM notification_delivery_retry_state s
	JOIN endpoints e ON e.id=s.endpoint_id AND e.project_id=s.project_id
	JOIN projects p ON p.id=s.project_id AND p.organization_id=s.organization_id
	JOIN organizations o ON o.id=s.organization_id `

const retryWarningEligibility = `s.warned_at IS NULL AND s.recovered_at IS NULL
	AND e.enabled AND e.verified_at IS NOT NULL AND e.deleted_at IS NULL
	AND p.deletion_requested_at IS NULL AND p.suspended_at IS NULL AND o.deletion_requested_at IS NULL
	AND NOT EXISTS(SELECT 1 FROM notification_delivery_state f
		WHERE f.endpoint_id=s.endpoint_id AND f.recovered_at IS NULL)
	AND EXISTS(SELECT 1 FROM deliveries d JOIN delivery_attempts a
		ON a.delivery_id=d.id AND a.project_id=d.project_id AND a.cycle=d.cycle
		WHERE d.endpoint_id=s.endpoint_id AND d.project_id=s.project_id AND d.state IN ('pending','leased')
		AND d.retry_deadline>clock_timestamp() AND (d.state='leased' OR d.attempt_count<d.max_attempts)
		AND (d.state='pending' OR d.lease_expires_at>clock_timestamp())
		AND a.outcome='retryable' AND a.delivery_state='pending' AND a.finished_at>=s.first_failure_at)`

// The timer can mature during a long backoff interval, independently of the
// next HTTP attempt. Bounded per-endpoint transactions recheck live state.
func (s *Store) GenerateDeliveryRetryWarnings(ctx context.Context, limit int) (int, error) {
	if limit < 1 || limit > 100 {
		return 0, fmt.Errorf("retry warning batch must contain 1 to 100 endpoints")
	}
	rows, err := s.pool.Query(ctx, `SELECT s.project_id,s.endpoint_id`+retryWarningJoins+`
		WHERE `+retryWarningEligibility+` AND s.first_failure_at<=clock_timestamp()-$1::interval
		ORDER BY s.first_failure_at,s.endpoint_id LIMIT $2`, deliveryInterval(deliveryRetryWarningDelay), limit)
	if err != nil {
		return 0, fmt.Errorf("select delivery retry warnings: %w", err)
	}
	type candidate struct{ ProjectID, EndpointID uuid.UUID }
	items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (candidate, error) {
		var item candidate
		err := row.Scan(&item.ProjectID, &item.EndpointID)
		return item, err
	})
	if err != nil {
		return 0, fmt.Errorf("read delivery retry warnings: %w", err)
	}
	created := 0
	for _, item := range items {
		if err := ctx.Err(); err != nil {
			return created, err
		}
		changed, err := s.generateDeliveryRetryWarning(ctx, item.ProjectID, item.EndpointID)
		if err != nil {
			return created, err
		}
		if changed {
			created++
		}
	}
	return created, nil
}

func (s *Store) generateDeliveryRetryWarning(ctx context.Context, projectID, endpointID uuid.UUID) (bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("begin delivery retry warning: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockProjectOrganization(ctx, tx, projectID); err != nil {
		if errors.Is(err, controls.ErrProjectNotFound) {
			return false, nil
		}
		return false, err
	}
	var id uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM projects WHERE id=$1
		AND deletion_requested_at IS NULL AND suspended_at IS NULL FOR SHARE`, projectID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("lock retry warning project: %w", err)
	}
	err = tx.QueryRow(ctx, `SELECT id FROM endpoints WHERE project_id=$1 AND id=$2
		AND enabled AND verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE`, projectID, endpointID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("lock retry warning endpoint: %w", err)
	}
	if err := lockDeliveryNotificationState(ctx, tx, endpointID); err != nil {
		return false, err
	}
	err = tx.QueryRow(ctx, `SELECT s.notification_id`+retryWarningJoins+` WHERE s.project_id=$1 AND s.endpoint_id=$2
		AND `+retryWarningEligibility+` AND s.first_failure_at<=clock_timestamp()-$3::interval FOR UPDATE OF s`,
		projectID, endpointID, deliveryInterval(deliveryRetryWarningDelay)).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("recheck delivery retry warning: %w", err)
	}
	_, err = tx.Exec(ctx, `UPDATE notification_delivery_retry_state SET warned_at=clock_timestamp() WHERE endpoint_id=$1`, endpointID)
	if err != nil {
		return false, fmt.Errorf("mark delivery retry warning: %w", err)
	}
	_, err = emitNotification(ctx, tx, notificationEvent{
		ID: id, ProjectID: projectID, Type: "delivery_retrying", Category: notifications.Delivery,
		Severity: "warning", Audience: "manager", Title: "Deliveries are still retrying",
		Body:         "One or more deliveries have been retrying for at least five minutes. Automatic retries continue; inspect this endpoint and its deliveries.",
		ResourceType: "endpoint", ResourceID: endpointID, SourceKey: "delivery:retrying:" + id.String(),
	})
	if err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("commit delivery retry warning: %w", err)
	}
	return true, nil
}
