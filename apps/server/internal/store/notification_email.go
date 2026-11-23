package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"cascadehook/internal/mailoutbox"
)

// Routine project updates stay in the inbox, even for recipients who opted in
// to every email category. Share this policy with enqueue and send-time checks.
const notificationEmailTypeFilter = `NOT IN ('project_created','project_renamed')`

// Recheck current membership generation, role, deletion state and preferences.
// The joins match inbox visibility; knowing a notification ID grants no access.
const notificationEmailJoins = ` FROM email_outbox e
	JOIN notification_recipients r ON r.notification_id=e.notification_id AND r.user_id=e.recipient_user_id
	JOIN notifications n ON n.id=r.notification_id AND n.organization_id=r.organization_id
	JOIN memberships m ON m.user_id=r.user_id AND m.organization_id=r.organization_id
		AND m.created_at=r.membership_created_at
	JOIN users u ON u.id=r.user_id
	JOIN organizations o ON o.id=r.organization_id
	LEFT JOIN notification_preferences prefs ON prefs.user_id=r.user_id
	LEFT JOIN projects p ON p.id=n.project_id AND p.organization_id=n.organization_id
	LEFT JOIN organization_notification_preferences op ON op.user_id=r.user_id AND op.organization_id=r.organization_id
	LEFT JOIN project_notification_preferences pp ON pp.user_id=r.user_id AND pp.project_id=n.project_id `

const notificationEmailEligible = `u.deletion_requested_at IS NULL AND o.deletion_requested_at IS NULL
	AND n.type ` + notificationEmailTypeFilter + `
	AND (n.project_id IS NULL OR (p.id IS NOT NULL AND p.deletion_requested_at IS NULL))
	AND (r.required_role='member' OR m.role='owner' OR (r.required_role='manager' AND m.role='admin'))
	AND (n.type='email_test' OR (prefs.email_enabled AND n.category=ANY(prefs.email_categories)
	AND n.severity=ANY(prefs.email_severities) AND coalesce(pp.email_enabled,true) AND coalesce(op.email_enabled,true)))
	AND n.created_at > clock_timestamp()-interval '23 hours'`

func claimNotificationEmail(ctx context.Context, tx pgx.Tx) (*mailoutbox.Job, error) {
	var job mailoutbox.Job
	err := tx.QueryRow(ctx, `SELECT e.id,e.organization_id,e.notification_id,u.identity_subject,
		n.title,n.body,n.created_at+interval '23 hours',e.attempts,
		coalesce(e.first_attempt_at,clock_timestamp()),e.payload_ciphertext`+notificationEmailJoins+`
		WHERE e.state IN ('queued','sending') AND e.next_attempt_at <= clock_timestamp()
		AND (e.leased_until IS NULL OR e.leased_until <= clock_timestamp()) AND `+notificationEmailEligible+`
		ORDER BY e.next_attempt_at,e.id LIMIT 1 FOR UPDATE OF e SKIP LOCKED`).Scan(
		&job.ID, &job.OrganizationID, &job.NotificationID, &job.RecipientSubject,
		&job.Title, &job.Body, &job.ExpiresAt, &job.Attempts, &job.FirstAttemptAt, &job.Payload,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("claim notification email: %w", err)
	}
	return &job, nil
}

func (s *Store) notificationEmailActive(ctx context.Context, job mailoutbox.Job) (bool, error) {
	var active bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1`+notificationEmailJoins+`
		WHERE e.id=$1 AND e.lease_id=$2 AND e.state='sending' AND e.leased_until > clock_timestamp()
		AND `+notificationEmailEligible+`)`, job.ID, job.LeaseID).Scan(&active)
	if err != nil {
		return false, fmt.Errorf("check notification email eligibility: %w", err)
	}
	return active, nil
}
