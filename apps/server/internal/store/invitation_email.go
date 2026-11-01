package store

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/accounts"
)

func enqueueInvitationEmail(ctx context.Context, tx pgx.Tx, actorID uuid.UUID, invitation accounts.Invitation) error {
	rateKey := sha256.Sum256([]byte("invitation-rate:" + actorID.String()))
	if err := lockIdentity(ctx, tx, rateKey); err != nil {
		return err
	}
	var count int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM email_outbox
		WHERE created_by_user_id=$1 AND created_at > clock_timestamp()-interval '24 hours'`, actorID).Scan(&count); err != nil {
		return fmt.Errorf("check invitation email budget: %w", err)
	}
	if count >= 100 {
		return &accounts.QuotaError{Resource: "daily_invitations"}
	}
	id, err := uuid.NewV7()
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO email_outbox(id,invitation_id,organization_id,created_by_user_id)
		VALUES($1,$2,$3,$4)`, id, invitation.ID, invitation.OrganizationID, actorID)
	if err != nil {
		return fmt.Errorf("queue invitation email: %w", err)
	}
	return nil
}

func (s *Store) ResendInvitation(ctx context.Context, actorID, organizationID, id uuid.UUID) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer rollbackTransaction(tx)
	role, err := lockOrganizationAccess(ctx, tx, actorID, organizationID)
	if err != nil {
		return err
	}
	if role != accounts.Owner {
		return accounts.ErrForbidden
	}
	var invitation accounts.Invitation
	err = scanInvitation(tx.QueryRow(ctx, `SELECT `+invitationColumns+` FROM organization_invitations
		WHERE id=$1 AND organization_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL
		AND expires_at > clock_timestamp() FOR UPDATE`, id, organizationID), &invitation)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.ErrInvitationInvalid
	}
	if err != nil {
		return err
	}
	var coolingDown bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM email_outbox
		WHERE invitation_id=$1 AND created_at > clock_timestamp()-interval '1 minute')`, id).Scan(&coolingDown); err != nil {
		return err
	}
	if coolingDown {
		return accounts.ErrInvitationResend
	}
	_, err = tx.Exec(ctx, `UPDATE email_outbox SET state='cancelled',payload_ciphertext=NULL,updated_at=clock_timestamp()
		WHERE invitation_id=$1 AND state IN ('queued','sending')`, id)
	if err != nil {
		return err
	}
	if err := enqueueInvitationEmail(ctx, tx, actorID, invitation); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Knowing an invitation ID never authenticates a user. Acceptance still checks
// authoritative verified email, current inviter authority, quotas and expiry.
func (s *Store) InvitationHash(ctx context.Context, userID, id uuid.UUID) ([32]byte, error) {
	var hash [32]byte
	var raw []byte
	err := s.pool.QueryRow(ctx, `SELECT token_hash FROM organization_invitations
		WHERE id=$1 AND revoked_at IS NULL AND (expires_at > clock_timestamp() OR accepted_by_user_id=$2)`, id, userID).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return hash, accounts.ErrInvitationInvalid
	}
	if err != nil {
		return hash, err
	}
	copy(hash[:], raw)
	return hash, nil
}

func (s *Store) InvitationDestination(ctx context.Context, userID, invitationID uuid.UUID) (string, error) {
	var orgID uuid.UUID
	var projectID *uuid.UUID
	err := s.pool.QueryRow(ctx, `SELECT i.organization_id,p.id FROM organization_invitations i
		JOIN memberships m ON m.organization_id=i.organization_id AND m.user_id=$1
		LEFT JOIN projects p ON p.id=i.project_id AND p.organization_id=i.organization_id AND p.deletion_requested_at IS NULL
		WHERE i.id=$2 AND i.accepted_by_user_id=$1`, userID, invitationID).Scan(&orgID, &projectID)
	if err != nil {
		return "", err
	}
	if projectID != nil {
		return "/dashboard/projects/" + projectID.String(), nil
	}
	return "/dashboard?organization=" + orgID.String(), nil
}
