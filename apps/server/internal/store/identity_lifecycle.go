package store

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"cascadehook/internal/auth"
	"cascadehook/internal/clerk"
)

func (s *Store) SessionRevoked(ctx context.Context, identity auth.SessionIdentity) (bool, error) {
	digest := auth.IdentityDigest(auth.SessionIdentity{Issuer: identity.Issuer, Subject: identity.SessionID})
	var revoked bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM revoked_sessions WHERE identity_hash = $1)`,
		digest[:]).Scan(&revoked)
	if err != nil {
		return false, fmt.Errorf("check revoked session: %w", err)
	}
	return revoked, nil
}

// Lifecycle changes only move toward revocation. Late/duplicate notifications
// cannot reactivate an identity, and never implicitly delete a shared tenant.
func (s *Store) ApplyIdentityEvent(ctx context.Context, issuer string, event clerk.LifecycleEvent) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin identity event: %w", err)
	}
	defer rollbackTransaction(tx)
	identity := auth.SessionIdentity{Issuer: issuer, Subject: event.ObjectID}
	digest := auth.IdentityDigest(identity)
	if err := lockIdentity(ctx, tx, digest); err != nil {
		return err
	}
	messageHash := auth.IdentityDigest(auth.SessionIdentity{Issuer: issuer, Subject: event.MessageID})
	var existing []byte
	err = tx.QueryRow(ctx, `SELECT body_hash FROM identity_webhook_receipts WHERE message_hash = $1`,
		messageHash[:]).Scan(&existing)
	if err == nil {
		if !equalHash(existing, event.BodyHash) {
			return clerk.ErrInvalidWebhook
		}
		return nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("read identity event receipt: %w", err)
	}
	if event.Type == "user.deleted" {
		_, err = tx.Exec(ctx, `INSERT INTO deleted_account_identities (identity_hash)
			VALUES ($1) ON CONFLICT DO NOTHING`, digest[:])
		if err == nil {
			_, err = tx.Exec(
				ctx,
				`UPDATE users SET deletion_requested_at = coalesce(deletion_requested_at, clock_timestamp()),
				provider_delete_after = coalesce(provider_delete_after, clock_timestamp()),
				provider_deleted_at = clock_timestamp(), provider_delete_token = NULL,
				provider_delete_lease_expires_at = NULL WHERE identity_issuer = $1 AND identity_subject = $2`,
				issuer,
				event.ObjectID,
			)
		}
	} else {
		_, err = tx.Exec(ctx, `INSERT INTO revoked_sessions (identity_hash) VALUES ($1) ON CONFLICT DO NOTHING`,
			digest[:])
	}
	if err != nil {
		return fmt.Errorf("apply identity revocation: %w", err)
	}
	// Concurrent messages for the same identity serialize above. A provider
	// message ID reused for a different identity/body is rejected, not ignored.
	err = tx.QueryRow(
		ctx,
		`INSERT INTO identity_webhook_receipts (message_hash, body_hash) VALUES ($1,$2)
		ON CONFLICT (message_hash) DO UPDATE SET message_hash = EXCLUDED.message_hash
		WHERE identity_webhook_receipts.body_hash = EXCLUDED.body_hash RETURNING body_hash`,
		messageHash[:],
		event.BodyHash[:],
	).Scan(&existing)
	if errors.Is(err, pgx.ErrNoRows) {
		return clerk.ErrInvalidWebhook
	}
	if err != nil {
		return fmt.Errorf("record identity event: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit identity event: %w", err)
	}
	return nil
}

func equalHash(value []byte, expected [sha256.Size]byte) bool {
	return len(value) == sha256.Size && string(value) == string(expected[:])
}
