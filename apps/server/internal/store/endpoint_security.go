package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/auth"
	"cascadehook/internal/endpoints"
	"cascadehook/internal/signing"
)

// RotateEndpointSecret stores only authenticated ciphertext. An existing key
// remains available for dual signing for five minutes; rotations cannot overlap.
func (s *Store) RotateEndpointSecret(ctx context.Context, actor auth.Principal, endpointID uuid.UUID, encrypted []byte) (endpoints.SecretRotation, error) {
	projectID := actor.ProjectID
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return endpoints.SecretRotation{}, fmt.Errorf("begin signing secret rotation: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockProjectForEndpointChange(ctx, tx, actor); err != nil {
		return endpoints.SecretRotation{}, err
	}
	var rotating bool
	err = tx.QueryRow(ctx, `SELECT coalesce(previous_secret_expires_at > now(), false)
		FROM endpoints WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE`,
		projectID, endpointID).Scan(&rotating)
	if errors.Is(err, pgx.ErrNoRows) {
		return endpoints.SecretRotation{}, endpoints.ErrNotFound
	}
	if err != nil {
		return endpoints.SecretRotation{}, fmt.Errorf("find endpoint for signing secret rotation: %w", err)
	}
	if rotating {
		return endpoints.SecretRotation{}, endpoints.ErrRotationInProgress
	}
	var result endpoints.SecretRotation
	err = tx.QueryRow(ctx, `UPDATE endpoints SET
		previous_signing_secret = signing_secret,
		previous_secret_expires_at = CASE WHEN signing_secret IS NULL THEN NULL ELSE now() + $4::interval END,
		signing_secret = $3, signing_secret_updated_at = now(),
		verification_version = verification_version + 1, updated_at = now()
		WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL
		RETURNING signing_secret_updated_at, previous_secret_expires_at`,
		projectID, endpointID, encrypted, deliveryInterval(signing.RotationGrace),
	).Scan(&result.UpdatedAt, &result.PreviousSecretExpiresAt)
	if err != nil {
		return endpoints.SecretRotation{}, fmt.Errorf("rotate endpoint signing secret: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return endpoints.SecretRotation{}, fmt.Errorf("commit signing secret rotation: %w", err)
	}
	return result, nil
}

// BeginEndpointVerification persists a cooldown and reserves a configuration
// version. The transaction ends before any DNS lookup or outbound request.
func (s *Store) BeginEndpointVerification(ctx context.Context, actor auth.Principal, endpointID uuid.UUID) (endpoints.VerificationSnapshot, error) {
	projectID := actor.ProjectID
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return endpoints.VerificationSnapshot{}, fmt.Errorf("begin endpoint verification: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockProjectForEndpointChange(ctx, tx, actor); err != nil {
		return endpoints.VerificationSnapshot{}, err
	}
	if err := requireActiveProject(ctx, tx, projectID); err != nil {
		return endpoints.VerificationSnapshot{}, err
	}
	var snapshot endpoints.VerificationSnapshot
	var coolingDown bool
	err = tx.QueryRow(ctx, `SELECT url, verification_version, signing_secret,
		CASE WHEN previous_secret_expires_at > now() THEN previous_signing_secret ELSE NULL END,
		coalesce(verification_attempted_at + $3::interval > now(), false)
		FROM endpoints WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE`,
		projectID, endpointID, deliveryInterval(endpoints.VerificationCooldown),
	).Scan(&snapshot.URL, &snapshot.Version, &snapshot.SigningSecret, &snapshot.PreviousSigningSecret, &coolingDown)
	if errors.Is(err, pgx.ErrNoRows) {
		return endpoints.VerificationSnapshot{}, endpoints.ErrNotFound
	}
	if err != nil {
		return endpoints.VerificationSnapshot{}, fmt.Errorf("find endpoint for verification: %w", err)
	}
	if len(snapshot.SigningSecret) == 0 {
		return endpoints.VerificationSnapshot{}, endpoints.ErrSigningSecretRequired
	}
	if coolingDown {
		return endpoints.VerificationSnapshot{}, endpoints.ErrVerificationRateLimited
	}
	err = tx.QueryRow(ctx, `UPDATE endpoints SET verification_attempted_at = now(),
		verification_version = verification_version + 1
		WHERE project_id = $1 AND id = $2 RETURNING verification_version`,
		projectID, endpointID).Scan(&snapshot.Version)
	if err != nil {
		return endpoints.VerificationSnapshot{}, fmt.Errorf("reserve endpoint verification: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return endpoints.VerificationSnapshot{}, fmt.Errorf("commit endpoint verification reservation: %w", err)
	}
	return snapshot, nil
}

// ConfirmEndpointVerification accepts only a proof for the same URL/secret
// generation. Verification never enables delivery; enabling is a separate PATCH.
func (s *Store) ConfirmEndpointVerification(ctx context.Context, actor auth.Principal, endpointID uuid.UUID, version int64) (endpoints.Endpoint, error) {
	projectID := actor.ProjectID
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return endpoints.Endpoint{}, fmt.Errorf("begin endpoint verification confirmation: %w", err)
	}
	defer rollbackTransaction(tx)
	if err := lockProjectForEndpointChange(ctx, tx, actor); err != nil {
		return endpoints.Endpoint{}, err
	}
	var currentVersion int64
	err = tx.QueryRow(ctx, `SELECT verification_version FROM endpoints
		WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE`,
		projectID, endpointID).Scan(&currentVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		return endpoints.Endpoint{}, endpoints.ErrNotFound
	}
	if err != nil {
		return endpoints.Endpoint{}, fmt.Errorf("find endpoint for verification confirmation: %w", err)
	}
	if currentVersion != version {
		return endpoints.Endpoint{}, endpoints.ErrVerificationChanged
	}
	result, err := tx.Exec(ctx, `UPDATE endpoints SET verified_at = now(), updated_at = now()
		WHERE project_id = $1 AND id = $2 AND verification_version = $3 AND signing_secret IS NOT NULL`,
		projectID, endpointID, version)
	if err != nil {
		return endpoints.Endpoint{}, fmt.Errorf("confirm endpoint verification: %w", err)
	}
	if result.RowsAffected() != 1 {
		return endpoints.Endpoint{}, endpoints.ErrVerificationChanged
	}
	var endpoint endpoints.Endpoint
	err = scanEndpoint(tx.QueryRow(ctx, `SELECT `+endpointColumns+`
		FROM endpoints e WHERE e.project_id = $1 AND e.id = $2 AND e.deleted_at IS NULL`, projectID, endpointID), &endpoint)
	if err != nil {
		return endpoints.Endpoint{}, fmt.Errorf("read verified endpoint: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return endpoints.Endpoint{}, fmt.Errorf("commit endpoint verification: %w", err)
	}
	return endpoint, nil
}
