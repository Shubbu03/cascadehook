package store

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"cascadehook/internal/accounts"
	"cascadehook/internal/auth"
)

// User locks precede organization/project locks. Membership mutations acquire
// actor and target in UUID order, so account deletion cannot race a promotion.
func lockActiveUsers(ctx context.Context, tx pgx.Tx, ids ...uuid.UUID) error {
	unique := make(map[uuid.UUID]struct{}, len(ids))
	values := make([]pgtype.UUID, 0, len(ids))
	for _, id := range ids {
		if _, ok := unique[id]; !ok {
			unique[id] = struct{}{}
			values = append(values, pgtype.UUID{Bytes: [16]byte(id), Valid: true})
		}
	}
	rows, err := tx.Query(ctx, `SELECT id FROM users WHERE id = ANY($1::uuid[])
		AND deletion_requested_at IS NULL ORDER BY id FOR SHARE`, values)
	if err != nil {
		return fmt.Errorf("lock active account users: %w", err)
	}
	users, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
	if err != nil {
		return fmt.Errorf("read active account users: %w", err)
	}
	if len(users) != len(unique) {
		return accounts.ErrUserNotFound
	}
	return nil
}

func lockIdentity(ctx context.Context, tx pgx.Tx, digest [sha256.Size]byte) error {
	// #nosec G115 -- Advisory IDs preserve the signed 64-bit hash bit pattern.
	lockID := int64(binary.BigEndian.Uint64(digest[:8]))
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, lockID); err != nil {
		return fmt.Errorf("lock account identity: %w", err)
	}
	return nil
}

func (s *Store) RequestAccountDeletion(ctx context.Context, userID uuid.UUID) (accounts.AccountDeletion, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return accounts.AccountDeletion{}, fmt.Errorf("begin account deletion: %w", err)
	}
	defer rollbackTransaction(tx)
	var identity auth.SessionIdentity
	err = tx.QueryRow(ctx, `SELECT identity_issuer, identity_subject FROM users WHERE id = $1`, userID).
		Scan(&identity.Issuer, &identity.Subject)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.AccountDeletion{}, accounts.ErrAccountDeleted
	}
	if err != nil {
		return accounts.AccountDeletion{}, fmt.Errorf("find deletion identity: %w", err)
	}
	digest := auth.IdentityDigest(identity)
	if err := lockIdentity(ctx, tx, digest); err != nil {
		return accounts.AccountDeletion{}, err
	}
	var requestedAt *time.Time
	err = tx.QueryRow(ctx, `SELECT deletion_requested_at FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&requestedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.AccountDeletion{}, accounts.ErrAccountDeleted
	}
	if err != nil {
		return accounts.AccountDeletion{}, fmt.Errorf("lock account deletion: %w", err)
	}
	if requestedAt == nil {
		var owns bool
		err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM memberships m
			JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = $1
			AND m.role = 'owner' AND o.deletion_requested_at IS NULL)`, userID).Scan(&owns)
		if err != nil {
			return accounts.AccountDeletion{}, fmt.Errorf("check account organization ownership: %w", err)
		}
		if owns {
			return accounts.AccountDeletion{}, accounts.ErrOwnsOrganizations
		}
		var at time.Time
		err = tx.QueryRow(ctx, `UPDATE users SET deletion_requested_at = clock_timestamp(),
			provider_delete_after = clock_timestamp() WHERE id = $1 RETURNING deletion_requested_at`, userID).Scan(&at)
		if err != nil {
			return accounts.AccountDeletion{}, fmt.Errorf("request account deletion: %w", err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO deleted_account_identities (identity_hash)
			VALUES ($1) ON CONFLICT DO NOTHING`, digest[:]); err != nil {
			return accounts.AccountDeletion{}, fmt.Errorf("suppress deleted account identity: %w", err)
		}
		requestedAt = &at
	}
	if err := tx.Commit(ctx); err != nil {
		return accounts.AccountDeletion{}, fmt.Errorf("commit account deletion; retry to resolve acceptance: %w", err)
	}
	return accounts.AccountDeletion{UserID: userID, RequestedAt: *requestedAt}, nil
}

func (s *Store) RequestOrganizationDeletion(
	ctx context.Context,
	userID uuid.UUID,
	organizationID uuid.UUID,
) (accounts.OrganizationDeletion, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return accounts.OrganizationDeletion{}, fmt.Errorf("begin organization deletion: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockActiveUsers(ctx, tx, userID); err != nil {
		return accounts.OrganizationDeletion{}, err
	}
	var requestedAt *time.Time
	err = tx.QueryRow(ctx, `SELECT deletion_requested_at FROM organizations WHERE id = $1 FOR UPDATE`,
		organizationID).Scan(&requestedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return accounts.OrganizationDeletion{}, accounts.ErrNotFound
	}
	if err != nil {
		return accounts.OrganizationDeletion{}, fmt.Errorf("lock organization deletion: %w", err)
	}
	role, err := organizationRole(
		ctx,
		tx,
		userID,
		organizationID,
	)
	if err != nil {
		return accounts.OrganizationDeletion{}, err
	}
	if role != accounts.Owner {
		return accounts.OrganizationDeletion{}, accounts.ErrForbidden
	}
	if requestedAt == nil {
		var at time.Time
		err = tx.QueryRow(
			ctx,
			`UPDATE organizations SET deletion_requested_at = clock_timestamp(),
			deletion_requested_by_user_id = $2, updated_at = clock_timestamp()
			WHERE id = $1 RETURNING deletion_requested_at`,
			organizationID,
			userID,
		).Scan(&at)
		if err != nil {
			return accounts.OrganizationDeletion{}, fmt.Errorf("request organization deletion: %w", err)
		}
		requestedAt = &at
	}
	if err := tx.Commit(ctx); err != nil {
		return accounts.OrganizationDeletion{}, fmt.Errorf("commit organization deletion; retry to resolve acceptance: %w",
			err)
	}
	return accounts.OrganizationDeletion{OrganizationID: organizationID, RequestedAt: *requestedAt}, nil
}
