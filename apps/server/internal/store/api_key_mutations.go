package store

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"cascadehook/internal/auth"
	"cascadehook/internal/notifications"
)

type CreateAPIKeyParams struct {
	Name      string
	Prefix    string
	Hash      [sha256.Size]byte
	ExpiresAt *time.Time
}

type APIKeyRotation struct {
	Key        auth.APIKey `json:"key"`
	PreviousID uuid.UUID   `json:"previous_key_id"`
	RevokesAt  time.Time   `json:"previous_key_revokes_at"`
}

func (s *Store) CreateAPIKey(ctx context.Context, actor auth.Principal, params CreateAPIKeyParams) (auth.APIKey, error) {
	name, err := auth.NormalizeKeyName(params.Name)
	if err != nil {
		return auth.APIKey{}, err
	}
	params.Name = name
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return auth.APIKey{}, fmt.Errorf("begin API key creation: %w", err)
	}
	defer rollbackTransaction(tx)
	_, _, databaseNow, err := lockAPIKeyMutation(ctx, tx, actor, uuid.Nil)
	if err != nil {
		return auth.APIKey{}, err
	}
	if err := requireActiveProject(ctx, tx, actor.ProjectID); err != nil {
		return auth.APIKey{}, err
	}
	if err := checkResourceQuota(
		ctx,
		tx,
		actor.ProjectID,
		"api_keys",
	); err != nil {
		return auth.APIKey{}, err
	}
	if params.ExpiresAt != nil {
		at := params.ExpiresAt.UTC().Truncate(time.Microsecond)
		if at.Year() < 1 || at.Year() > 9999 || !at.After(databaseNow) {
			return auth.APIKey{}, auth.ErrInvalidKeyExpiry
		}
		params.ExpiresAt = &at
	}
	key, err := insertAPIKey(ctx, tx, actor, params, databaseNow)
	if err != nil {
		return auth.APIKey{}, err
	}
	if _, err := emitNotification(ctx, tx, notificationEvent{
		ProjectID: actor.ProjectID, ActorID: actor.UserID, Type: "api_key_created",
		Category: notifications.Credentials, Severity: "info", Audience: "manager",
		Title: "A project API key was created", Body: "A new integration credential was issued for this project.",
		ResourceType: "api_key", ResourceID: key.ID, SourceKey: "key:" + key.ID.String() + ":created",
	}); err != nil {
		return auth.APIKey{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return auth.APIKey{}, fmt.Errorf("commit API key creation: %w", err)
	}
	return key, nil
}

func (s *Store) RevokeAPIKey(ctx context.Context, actor auth.Principal, targetID uuid.UUID) error {
	if targetID == uuid.Nil {
		return auth.ErrAPIKeyNotFound
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return fmt.Errorf("begin API key revocation: %w", err)
	}
	defer rollbackTransaction(tx)
	_, target, databaseNow, err := lockAPIKeyMutation(ctx, tx, actor, targetID)
	if err != nil {
		return err
	}
	if target.RevokedAt != nil {
		return nil
	}
	// A human administrator can recover through their session even when every
	// integration credential is revoked. API-key callers need a replacement.
	if target.Status == auth.KeyActive && actor.UserID == uuid.Nil {
		var hasReplacement bool
		err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM api_keys WHERE project_id = $1 AND id <> $2
			AND revoked_at IS NULL AND revokes_at IS NULL AND (expires_at IS NULL OR expires_at > $3))`,
			actor.ProjectID, targetID, databaseNow).Scan(&hasReplacement)
		if err != nil {
			return fmt.Errorf("check remaining usable API keys: %w", err)
		}
		if !hasReplacement {
			return auth.ErrLastUsableAPIKey
		}
	}
	_, err = tx.Exec(ctx, `UPDATE api_keys SET revoked_at = $3, revoked_by_api_key_id = $4, revoked_by_user_id = $5
		WHERE project_id = $1 AND id = $2 AND revoked_at IS NULL`,
		actor.ProjectID, targetID, databaseNow, nullableUUID(actor.APIKeyID), nullableUUID(actor.UserID))
	if err != nil {
		return fmt.Errorf("revoke API key: %w", err)
	}
	if _, err := emitNotification(ctx, tx, notificationEvent{
		ProjectID: actor.ProjectID, ActorID: actor.UserID, Type: "api_key_revoked",
		Category: notifications.Credentials, Severity: "warning", Audience: "manager",
		Title: "An API key was revoked", Body: "A project API key was revoked. Applications using it will need an active replacement.",
		ResourceType: "api_key", ResourceID: targetID, SourceKey: "key:" + targetID.String() + ":revoked",
	}); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit API key revocation: %w", err)
	}
	return nil
}

// RotateAPIKey preserves environment, name, and original expiry. The supplied
// replacement must have been generated for the target's environment.
func (s *Store) RotateAPIKey(ctx context.Context, actor auth.Principal, targetID uuid.UUID, prefix string, hash [sha256.Size]byte) (APIKeyRotation, error) {
	if targetID == uuid.Nil {
		return APIKeyRotation{}, auth.ErrAPIKeyNotFound
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return APIKeyRotation{}, fmt.Errorf("begin API key rotation: %w", err)
	}
	defer rollbackTransaction(tx)
	_, target, databaseNow, err := lockAPIKeyMutation(ctx, tx, actor, targetID)
	if err != nil {
		return APIKeyRotation{}, err
	}
	if err := requireActiveProject(ctx, tx, actor.ProjectID); err != nil {
		return APIKeyRotation{}, err
	}
	if target.Status != auth.KeyActive {
		return APIKeyRotation{}, auth.ErrInactiveAPIKey
	}
	if target.RotatedToID != nil {
		return APIKeyRotation{}, auth.ErrAPIKeyRotationPending
	}
	if err := checkResourceQuota(
		ctx,
		tx,
		actor.ProjectID,
		"retained_api_keys",
	); err != nil {
		return APIKeyRotation{}, err
	}
	if !validAPIKeyPrefix(prefix, target.Environment) {
		return APIKeyRotation{}, auth.ErrInvalidKeyEnvironment
	}
	replacement, err := insertAPIKey(ctx, tx, actor, CreateAPIKeyParams{
		Name: target.Name, Prefix: prefix, Hash: hash, ExpiresAt: target.ExpiresAt,
	}, databaseNow)
	if err != nil {
		return APIKeyRotation{}, err
	}
	deadline := databaseNow.Add(auth.APIKeyRotationOverlap)
	if target.ExpiresAt != nil && target.ExpiresAt.Before(deadline) {
		deadline = *target.ExpiresAt
	}
	_, err = tx.Exec(ctx, `UPDATE api_keys SET rotated_to_id = $3, revokes_at = $4,
		revoked_by_api_key_id = $5, revoked_by_user_id = $6 WHERE project_id = $1 AND id = $2`,
		actor.ProjectID, targetID, replacement.ID, deadline, nullableUUID(actor.APIKeyID), nullableUUID(actor.UserID))
	if err != nil {
		return APIKeyRotation{}, fmt.Errorf("schedule previous API key revocation: %w", err)
	}
	if _, err := emitNotification(ctx, tx, notificationEvent{
		ProjectID: actor.ProjectID, ActorID: actor.UserID, Type: "api_key_rotated",
		Category: notifications.Credentials, Severity: "info", Audience: "manager",
		Title: "An API key was rotated", Body: "A replacement project API key was created. The previous key retires after its overlap period.",
		ResourceType: "api_key", ResourceID: replacement.ID, SourceKey: "key:" + targetID.String() + ":rotated",
	}); err != nil {
		return APIKeyRotation{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return APIKeyRotation{}, fmt.Errorf("commit API key rotation: %w", err)
	}
	return APIKeyRotation{Key: replacement, PreviousID: targetID, RevokesAt: deadline}, nil
}

func validAPIKeyPrefix(prefix string, environment auth.KeyEnvironment) bool {
	// The database enforces the complete display-prefix format as well.
	return len(prefix) == len("ch_"+string(environment)+"_")+12 &&
		prefix[:len(prefix)-12] == "ch_"+string(environment)+"_"
}

func insertAPIKey(ctx context.Context, tx pgx.Tx, actor auth.Principal, params CreateAPIKeyParams, at time.Time) (auth.APIKey, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return auth.APIKey{}, fmt.Errorf("generate API key ID: %w", err)
	}
	var key auth.APIKey
	err = scanAPIKey(tx.QueryRow(ctx, `INSERT INTO api_keys AS k
		(id, project_id, name, key_prefix, key_hash, created_at, expires_at, created_by_api_key_id, created_by_user_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING `+apiKeyColumns,
		id, actor.ProjectID, params.Name, params.Prefix, params.Hash[:], at, params.ExpiresAt,
		nullableUUID(actor.APIKeyID), nullableUUID(actor.UserID)), &key)
	if err != nil {
		return auth.APIKey{}, fmt.Errorf("create API key: %w", err)
	}
	key.Status = key.StatusAt(at)
	return key, nil
}

// All management mutations serialize on the project row, then lock their key
// rows in ID order and reauthorize using fresh database time. Concurrent mutual
// revocations cannot both succeed, and a revoked caller cannot create new keys.
// Human actors first hold and recheck organization access independently.
func lockAPIKeyMutation(ctx context.Context, tx pgx.Tx, actor auth.Principal, targetID uuid.UUID) (auth.APIKey, auth.APIKey, time.Time, error) {
	if !actor.Valid() {
		return auth.APIKey{}, auth.APIKey{}, time.Time{}, auth.ErrInvalidAPIKey
	}
	if actor.UserID != uuid.Nil {
		if _, err := lockHumanProjectAccess(ctx, tx, actor); err != nil {
			return auth.APIKey{}, auth.APIKey{}, time.Time{}, err
		}
	}
	if err := lockProjectOrganization(ctx, tx, actor.ProjectID); err != nil {
		return auth.APIKey{}, auth.APIKey{}, time.Time{}, err
	}
	var projectID uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM projects
		WHERE id = $1 AND deletion_requested_at IS NULL FOR UPDATE`, actor.ProjectID).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return auth.APIKey{}, auth.APIKey{}, time.Time{}, auth.ErrInvalidAPIKey
	}
	if err != nil {
		return auth.APIKey{}, auth.APIKey{}, time.Time{}, fmt.Errorf("lock API key project: %w", err)
	}
	ids := make([]pgtype.UUID, 0, 2)
	if actor.APIKeyID != uuid.Nil {
		ids = append(ids, pgtype.UUID{Bytes: [16]byte(actor.APIKeyID), Valid: true})
	}
	if targetID != uuid.Nil && targetID != actor.APIKeyID {
		ids = append(ids, pgtype.UUID{Bytes: [16]byte(targetID), Valid: true})
	}
	rows, err := tx.Query(ctx, `SELECT `+apiKeyColumns+` FROM api_keys k
		WHERE k.project_id = $1 AND k.id = ANY($2::uuid[]) ORDER BY k.id FOR UPDATE OF k`, actor.ProjectID, ids)
	if err != nil {
		return auth.APIKey{}, auth.APIKey{}, time.Time{}, fmt.Errorf("lock API keys: %w", err)
	}
	keys, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (auth.APIKey, error) {
		var key auth.APIKey
		err := scanAPIKey(row, &key)
		return key, err
	})
	if err != nil {
		return auth.APIKey{}, auth.APIKey{}, time.Time{}, fmt.Errorf("read locked API keys: %w", err)
	}
	var databaseNow time.Time
	if err := tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&databaseNow); err != nil {
		return auth.APIKey{}, auth.APIKey{}, time.Time{}, fmt.Errorf("read API key database time: %w", err)
	}
	var manager, target auth.APIKey
	for _, key := range keys {
		key.Status = key.StatusAt(databaseNow)
		if key.ID == actor.APIKeyID {
			manager = key
		}
		if key.ID == targetID {
			target = key
		}
	}
	if actor.APIKeyID != uuid.Nil && (manager.ID == uuid.Nil || manager.Status != auth.KeyActive) {
		return auth.APIKey{}, auth.APIKey{}, time.Time{}, auth.ErrInvalidAPIKey
	}
	if targetID != uuid.Nil && target.ID == uuid.Nil {
		return auth.APIKey{}, auth.APIKey{}, time.Time{}, auth.ErrAPIKeyNotFound
	}
	return manager, target, databaseNow, nil
}

func nullableUUID(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}
