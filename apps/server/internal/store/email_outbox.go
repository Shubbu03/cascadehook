package store

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/mailoutbox"
)

func (s *Store) ClaimEmail(ctx context.Context, dailyLimit int) (*mailoutbox.Job, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackTransaction(tx)
	key := sha256.Sum256([]byte("email-outbox-global-budget"))
	if err := lockIdentity(ctx, tx, key); err != nil {
		return nil, err
	}
	var used int
	err = tx.QueryRow(ctx, `INSERT INTO email_send_budgets(day) VALUES((transaction_timestamp() AT TIME ZONE 'UTC')::date)
		ON CONFLICT(day) DO UPDATE SET day=EXCLUDED.day RETURNING attempts`).Scan(&used)
	if err != nil {
		return nil, err
	}
	if used >= dailyLimit {
		return nil, nil
	}
	leaseID, err := uuid.NewV7()
	if err != nil {
		return nil, err
	}
	var job mailoutbox.Job
	err = tx.QueryRow(ctx, `SELECT e.id,e.invitation_id,e.organization_id,i.email,o.name,i.role,i.expires_at,
		e.attempts,coalesce(e.first_attempt_at,clock_timestamp()),e.payload_ciphertext,coalesce(e.clerk_invitation_id,'')
		FROM email_outbox e JOIN organization_invitations i ON i.id=e.invitation_id
		JOIN organizations o ON o.id=i.organization_id JOIN users u ON u.id=i.created_by_user_id
		JOIN memberships m ON m.organization_id=i.organization_id AND m.user_id=u.id AND m.role='owner'
		WHERE e.state IN ('queued','sending') AND e.next_attempt_at <= clock_timestamp()
		AND (e.leased_until IS NULL OR e.leased_until <= clock_timestamp())
		AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > clock_timestamp()
		AND o.deletion_requested_at IS NULL AND u.deletion_requested_at IS NULL
		ORDER BY e.next_attempt_at,e.id LIMIT 1 FOR UPDATE OF e SKIP LOCKED`).Scan(
		&job.ID, &job.InvitationID, &job.OrganizationID, &job.Email, &job.OrganizationName, &job.Role,
		&job.ExpiresAt, &job.Attempts, &job.FirstAttemptAt, &job.Payload, &job.ClerkInvitationID,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("claim email: %w", err)
	}
	job.LeaseID = leaseID
	job.Attempts++
	_, err = tx.Exec(ctx, `UPDATE email_outbox SET state='sending',lease_id=$2,
		leased_until=clock_timestamp()+interval '90 seconds',attempts=attempts+1,
		first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),updated_at=clock_timestamp() WHERE id=$1`, job.ID, leaseID)
	if err != nil {
		return nil, err
	}
	_, err = tx.Exec(ctx, `UPDATE email_send_budgets SET attempts=attempts+1
		WHERE day=(transaction_timestamp() AT TIME ZONE 'UTC')::date`)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &job, nil
}

func (s *Store) EmailActive(ctx context.Context, job mailoutbox.Job) (bool, error) {
	var active bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM email_outbox e
		JOIN organization_invitations i ON i.id=e.invitation_id JOIN organizations o ON o.id=i.organization_id
		JOIN users u ON u.id=i.created_by_user_id JOIN memberships m ON m.user_id=u.id AND m.organization_id=o.id
		WHERE e.id=$1 AND e.lease_id=$2 AND e.state='sending' AND e.leased_until > clock_timestamp()
		AND i.revoked_at IS NULL AND i.accepted_at IS NULL AND i.expires_at > clock_timestamp()
		AND o.deletion_requested_at IS NULL AND u.deletion_requested_at IS NULL AND m.role='owner')`, job.ID, job.LeaseID).Scan(&active)
	return active, err
}

func (s *Store) SaveEmailPayload(ctx context.Context, job mailoutbox.Job, payload []byte, clerkID string) error {
	result, err := s.pool.Exec(ctx, `UPDATE email_outbox SET payload_ciphertext=$3,clerk_invitation_id=nullif($4,''),
		updated_at=clock_timestamp() WHERE id=$1 AND lease_id=$2 AND state='sending'`, job.ID, job.LeaseID, payload, clerkID)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return fmt.Errorf("email lease changed")
	}
	return nil
}

func (s *Store) FinishEmail(ctx context.Context, job mailoutbox.Job, result mailoutbox.Completion) error {
	state := "failed"
	if result.MessageID != "" {
		state = "sent"
	}
	if result.RetryAt != nil {
		state = "queued"
	}
	if result.Cancelled {
		state = "cancelled"
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer rollbackTransaction(tx)
	updated, err := tx.Exec(ctx, `UPDATE email_outbox SET state=$3,provider_message_id=nullif($4,''),last_error=nullif($5,''),
		next_attempt_at=coalesce($6,next_attempt_at),leased_until=NULL,lease_id=NULL,updated_at=clock_timestamp(),
		payload_ciphertext=CASE WHEN $3='queued' THEN payload_ciphertext ELSE NULL END
		WHERE id=$1 AND lease_id=$2 AND state='sending'`, job.ID, job.LeaseID, state, result.MessageID, result.ErrorCode, result.RetryAt)
	if err != nil {
		return err
	}
	if updated.RowsAffected() == 0 {
		return nil
	}
	if result.MessageID != "" {
		_, err = tx.Exec(ctx, `UPDATE email_outbox e SET state=v.state,provider_event_at=v.occurred_at
			FROM (SELECT state,occurred_at FROM email_delivery_events WHERE provider_message_id=$2
			ORDER BY occurred_at DESC,id DESC LIMIT 1) v WHERE e.id=$1 AND e.provider_message_id=$2
			AND (e.provider_event_at IS NULL OR e.provider_event_at <= v.occurred_at)`, job.ID, result.MessageID)
		if err != nil {
			return err
		}
	}
	if err := tx.QueryRow(ctx, `SELECT state FROM email_outbox WHERE id=$1`, job.ID).Scan(&state); err != nil {
		return err
	}
	if emailFailed(state) {
		if err := notifyEmailFailure(ctx, tx, job.ID, job.OrganizationID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) ApplyEmailEvent(ctx context.Context, event mailoutbox.Event) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer rollbackTransaction(tx)
	result, err := tx.Exec(ctx, `INSERT INTO email_delivery_events(id,provider_message_id,state,occurred_at)
		VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, event.ID, event.MessageID, event.State, event.OccurredAt)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return nil
	}
	var jobID, orgID uuid.UUID
	err = tx.QueryRow(ctx, `UPDATE email_outbox SET state=$2,provider_event_at=$3,updated_at=clock_timestamp(),
		provider_message_id=$1,payload_ciphertext=NULL,lease_id=NULL,leased_until=NULL
		WHERE (provider_message_id=$1 OR (id=$4 AND provider_message_id IS NULL))
		AND (provider_event_at IS NULL OR provider_event_at < $3)
		AND (state NOT IN ('bounced','complained','suppressed') OR $2 IN ('bounced','complained','suppressed'))
		RETURNING id,organization_id`, event.MessageID, event.State, event.OccurredAt, event.JobID).Scan(&jobID, &orgID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if err == nil && emailFailed(event.State) {
		if err := notifyEmailFailure(ctx, tx, jobID, orgID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func emailFailed(state string) bool {
	return state == "failed" || state == "bounced" || state == "complained" || state == "suppressed"
}

func notifyEmailFailure(ctx context.Context, tx pgx.Tx, jobID, orgID uuid.UUID) error {
	_, err := emitNotification(ctx, tx, notificationEvent{
		OrganizationID: orgID, Type: "invitation_email_failed", Category: "team", Severity: "warning", Audience: "owner",
		Title: "An invitation email could not be delivered", Body: "Review pending invitations and resend the email or correct the recipient address.",
		ResourceType: "members", SourceKey: "invitation-email:" + jobID.String() + ":failed",
	})
	return err
}

func (s *Store) PendingEmailRevocations(ctx context.Context) ([]mailoutbox.Revocation, error) {
	rows, err := s.pool.Query(ctx, `SELECT e.id,e.clerk_invitation_id FROM email_outbox e
		JOIN organization_invitations i ON i.id=e.invitation_id JOIN organizations o ON o.id=i.organization_id
		WHERE e.clerk_invitation_id IS NOT NULL AND e.clerk_revoked_at IS NULL
		AND (i.revoked_at IS NOT NULL OR i.accepted_at IS NOT NULL OR i.expires_at <= clock_timestamp()
		OR o.deletion_requested_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
		WHERE m.organization_id=o.id AND m.user_id=i.created_by_user_id AND m.role='owner' AND u.deletion_requested_at IS NULL))
		ORDER BY e.id LIMIT 20`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []mailoutbox.Revocation{}
	for rows.Next() {
		var item mailoutbox.Revocation
		if err := rows.Scan(&item.JobID, &item.ClerkID); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) FinishEmailRevocation(ctx context.Context, id uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `UPDATE email_outbox SET clerk_revoked_at=clock_timestamp() WHERE id=$1`, id)
	return err
}

func (s *Store) CleanEmailOutbox(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `UPDATE email_outbox e SET state=CASE WHEN e.state IN ('queued','sending')
		THEN 'cancelled' ELSE e.state END,payload_ciphertext=NULL,updated_at=clock_timestamp()
		WHERE e.id IN (SELECT x.id FROM email_outbox x JOIN organization_invitations i ON i.id=x.invitation_id
		JOIN organizations o ON o.id=i.organization_id WHERE (x.state IN ('queued','sending') OR x.payload_ciphertext IS NOT NULL)
		AND (i.revoked_at IS NOT NULL OR i.accepted_at IS NOT NULL OR i.expires_at <= clock_timestamp()
		OR o.deletion_requested_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
		WHERE m.organization_id=o.id AND m.user_id=i.created_by_user_id AND m.role='owner' AND u.deletion_requested_at IS NULL))
		ORDER BY x.id LIMIT 500)`)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `DELETE FROM email_delivery_events WHERE id IN
		(SELECT id FROM email_delivery_events WHERE created_at < clock_timestamp()-interval '30 days' LIMIT 500)`)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `DELETE FROM email_send_budgets WHERE day < current_date-32`)
	return err
}
