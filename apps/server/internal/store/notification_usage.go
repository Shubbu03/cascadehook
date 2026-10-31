package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/notifications"
)

// Usage admission and this notice share a transaction. Rejected publications
// cannot create phantom alerts; retries share the month/limit-version identity.
func notifyUsageThresholds(ctx context.Context, tx pgx.Tx, projectID uuid.UUID, period time.Time) error {
	var organizationID uuid.UUID
	var version, events, jobs, stored, eventLimit, jobLimit, storageLimit int64
	err := tx.QueryRow(ctx, `SELECT o.id,o.quota_version,
		u.events,u.deliveries,coalesce(s.payload_bytes,0),o.max_monthly_events,o.max_monthly_deliveries,o.max_payload_bytes_per_project
		FROM projects p JOIN organizations o ON o.id = p.organization_id
		JOIN organization_usage_months u ON u.organization_id = o.id
			AND u.period = $2
		LEFT JOIN project_storage s ON s.project_id = p.id WHERE p.id = $1`, projectID, period).Scan(
		&organizationID, &version, &events, &jobs, &stored, &eventLimit, &jobLimit, &storageLimit,
	)
	if err != nil {
		return fmt.Errorf("read notification usage thresholds: %w", err)
	}
	metrics := []struct {
		name, label   string
		value, limit  int64
		projectScoped bool
	}{
		{name: "events", label: "Monthly event usage", value: events, limit: eventLimit},
		{name: "deliveries", label: "Monthly delivery usage", value: jobs, limit: jobLimit},
		{name: "storage", label: "Stored payload usage", value: stored, limit: storageLimit, projectScoped: true},
	}
	for _, metric := range metrics {
		threshold := 0
		switch {
		case metric.value >= metric.limit:
			threshold = 100
		case metric.value*100 >= metric.limit*80:
			threshold = 80
		default:
			continue
		}
		event := notificationEvent{
			OrganizationID: organizationID, Type: "usage_threshold", Category: notifications.Usage,
			Severity: "warning", Audience: "manager", Title: fmt.Sprintf("%s reached %d%%", metric.label, threshold),
			Body:         "Review usage and available capacity before publishing more events.",
			ResourceType: "usage", ResourceID: organizationID,
		}
		scope := organizationID
		if metric.projectScoped {
			event.ProjectID, event.ResourceID, scope = projectID, projectID, projectID
		}
		event.SourceKey = fmt.Sprintf("usage:%s:%s:%s:%d:%d", scope, period.Format("2006-01"), metric.name, version, threshold)
		if _, err := emitNotification(ctx, tx, event); err != nil {
			return err
		}
	}
	return nil
}
