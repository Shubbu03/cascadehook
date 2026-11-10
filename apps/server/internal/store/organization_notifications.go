package store

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/accounts"
	"cascadehook/internal/notifications"
)

var ErrEmailTestRateLimited = errors.New("test email rate limited")

func (s *Store) OrganizationNotificationPreferences(ctx context.Context, userID, organizationID uuid.UUID) (notifications.ProjectPreferences, error) {
	if _, err := s.GetOrganization(ctx, userID, organizationID); err != nil {
		return notifications.ProjectPreferences{}, err
	}
	preferences := notifications.ProjectPreferences{EmailEnabled: true}
	err := s.pool.QueryRow(ctx, `SELECT email_enabled FROM organization_notification_preferences WHERE user_id=$1 AND organization_id=$2`, userID, organizationID).Scan(&preferences.EmailEnabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return notifications.ProjectPreferences{EmailEnabled: true}, nil
	}
	if err != nil {
		return notifications.ProjectPreferences{}, fmt.Errorf("read organization notification preferences: %w", err)
	}
	return preferences, nil
}

func (s *Store) SaveOrganizationNotificationPreferences(ctx context.Context, userID, organizationID uuid.UUID, preferences notifications.ProjectPreferences) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin organization notification preferences update: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockNotificationOrganization(ctx, tx, userID, organizationID); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO organization_notification_preferences(organization_id,user_id,email_enabled) VALUES($1,$2,$3)
		ON CONFLICT(organization_id,user_id) DO UPDATE SET email_enabled=EXCLUDED.email_enabled`, organizationID, userID, preferences.EmailEnabled)
	if err != nil {
		return fmt.Errorf("save organization notification preferences: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit organization notification preferences update: %w", err)
	}
	return nil
}

type EmailTest struct {
	ID    uuid.UUID `json:"id"`
	State string    `json:"state"`
}

func (s *Store) QueueTestEmail(ctx context.Context, userID, organizationID uuid.UUID) (EmailTest, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return EmailTest{}, fmt.Errorf("begin test email: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockNotificationOrganization(ctx, tx, userID, organizationID); err != nil {
		return EmailTest{}, err
	}
	key := sha256.Sum256([]byte("test-email:" + userID.String()))
	if err := lockIdentity(ctx, tx, key); err != nil {
		return EmailTest{}, err
	}
	var coolingDown bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM email_outbox e JOIN notifications n ON n.id=e.notification_id
		WHERE e.recipient_user_id=$1 AND n.type='email_test' AND e.created_at>clock_timestamp()-interval '1 minute')`, userID).Scan(&coolingDown)
	if err != nil {
		return EmailTest{}, fmt.Errorf("check test email cooldown: %w", err)
	}
	if coolingDown {
		return EmailTest{}, ErrEmailTestRateLimited
	}
	notificationID, err := uuid.NewV7()
	if err != nil {
		return EmailTest{}, fmt.Errorf("generate test notification ID: %w", err)
	}
	jobID, err := uuid.NewV7()
	if err != nil {
		return EmailTest{}, fmt.Errorf("generate test email ID: %w", err)
	}
	// The notification row only carries the message and recipient for the
	// mail job. Inbox visibility excludes this type.
	_, err = tx.Exec(ctx, `INSERT INTO notifications(id,organization_id,type,category,severity,title,body,resource_type,source_key)
		VALUES($1,$2,'email_test','access','info','Your Cascadehook test email',
		'This is the test email you requested from notification settings.',
		'members',$3)`, notificationID, organizationID, "email-test:"+jobID.String())
	if err != nil {
		return EmailTest{}, fmt.Errorf("create test notification: %w", err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO notification_recipients(organization_id,notification_id,user_id,membership_created_at,required_role)
		SELECT organization_id,$3,user_id,created_at,'member' FROM memberships WHERE user_id=$1 AND organization_id=$2`, userID, organizationID, notificationID)
	if err != nil {
		return EmailTest{}, fmt.Errorf("create test email recipient: %w", err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO email_outbox(id,organization_id,created_by_user_id,notification_id,recipient_user_id)
		VALUES($1,$2,$3,$4,$3)`, jobID, organizationID, userID, notificationID)
	if err != nil {
		return EmailTest{}, fmt.Errorf("queue test email: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return EmailTest{}, fmt.Errorf("commit test email: %w", err)
	}
	return EmailTest{ID: jobID, State: "queued"}, nil
}

func (s *Store) TestEmailStatus(ctx context.Context, userID, organizationID, jobID uuid.UUID) (EmailTest, error) {
	if _, err := s.GetOrganization(ctx, userID, organizationID); err != nil {
		return EmailTest{}, err
	}
	result := EmailTest{ID: jobID}
	err := s.pool.QueryRow(ctx, `SELECT e.state FROM email_outbox e JOIN notifications n ON n.id=e.notification_id
		WHERE e.id=$1 AND e.recipient_user_id=$2 AND e.organization_id=$3 AND n.type='email_test'`, jobID, userID, organizationID).Scan(&result.State)
	if errors.Is(err, pgx.ErrNoRows) {
		return EmailTest{}, accounts.ErrNotFound
	}
	if err != nil {
		return EmailTest{}, fmt.Errorf("read test email status: %w", err)
	}
	return result, nil
}
