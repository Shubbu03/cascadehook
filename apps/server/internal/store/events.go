package store

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"cascadehook/internal/auth"
	"cascadehook/internal/events"
)

// PublishEvent commits the original request bytes and their delivery jobs as
// one unit. An idempotent replay returns the original receipt without fan-out.
func (s *Store) PublishEvent(ctx context.Context, projectID uuid.UUID, body []byte, key string) (events.Accepted, error) {
	eventType, err := events.ValidatePublication(body, key)
	if err != nil {
		return events.Accepted{}, err
	}
	digest := sha256.Sum256(body)
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return events.Accepted{}, fmt.Errorf("begin event publication: %w", err)
	}
	defer rollbackTransaction(tx)

	// Transaction-scoped advisory locks serialize only requests using the
	// same project/key. A hash collision merely serializes unrelated requests;
	// the actual identity is still enforced by the table's composite key.
	lockHash := sha256.Sum256([]byte(projectID.String() + ":" + key))
	lockID := int64(binary.BigEndian.Uint64(lockHash[:8]))
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, lockID); err != nil {
		return events.Accepted{}, fmt.Errorf("lock publication key: %w", err)
	}
	// Lock the parent before touching its child rows, matching endpoint
	// mutation ordering and avoiding a race with project deletion. Publishers
	// share this lock; endpoint changes take the exclusive counterpart.
	var lockedProject uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM projects WHERE id = $1 FOR SHARE`, projectID).Scan(&lockedProject)
	if errors.Is(err, pgx.ErrNoRows) {
		return events.Accepted{}, auth.ErrInvalidAPIKey
	}
	if err != nil {
		return events.Accepted{}, fmt.Errorf("lock publication project: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM event_idempotency_keys
		WHERE project_id = $1 AND idempotency_key = $2 AND expires_at <= now()`, projectID, key); err != nil {
		return events.Accepted{}, fmt.Errorf("expire publication key: %w", err)
	}
	var result events.Accepted
	var storedHash []byte
	err = tx.QueryRow(ctx, `SELECT e.id, e.event_type, e.created_at, e.delivery_count, e.request_hash
		FROM event_idempotency_keys k JOIN events e ON e.project_id = k.project_id AND e.id = k.event_id
		WHERE k.project_id = $1 AND k.idempotency_key = $2`, projectID, key,
	).Scan(&result.ID, &result.Type, &result.CreatedAt, &result.DeliveryCount, &storedHash)
	if err == nil {
		if !bytes.Equal(storedHash, digest[:]) {
			return events.Accepted{}, events.ErrIdempotencyConflict
		}
		result.Replayed = true
		return result, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return events.Accepted{}, fmt.Errorf("find published event: %w", err)
	}

	id, err := uuid.NewV7()
	if err != nil {
		return events.Accepted{}, fmt.Errorf("generate event ID: %w", err)
	}
	err = tx.QueryRow(ctx, `INSERT INTO events (id, project_id, event_type, payload, request_hash)
		VALUES ($1, $2, $3, $4, $5) RETURNING id, event_type, created_at`,
		id, projectID, eventType, body, digest[:],
	).Scan(&result.ID, &result.Type, &result.CreatedAt)
	if err != nil {
		return events.Accepted{}, fmt.Errorf("create event: %w", err)
	}
	result.DeliveryCount, err = fanOutEvent(ctx, tx, projectID, id, eventType)
	if err != nil {
		return events.Accepted{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE events SET delivery_count = $3 WHERE project_id = $1 AND id = $2`,
		projectID, id, result.DeliveryCount); err != nil {
		return events.Accepted{}, fmt.Errorf("record event delivery count: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO event_idempotency_keys (project_id, idempotency_key, event_id)
		VALUES ($1, $2, $3)`, projectID, key, id); err != nil {
		return events.Accepted{}, fmt.Errorf("record publication key: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return events.Accepted{}, fmt.Errorf("commit event publication: %w", err)
	}
	return result, nil
}

func fanOutEvent(ctx context.Context, tx pgx.Tx, projectID, eventID uuid.UUID, eventType string) (int, error) {
	rows, err := tx.Query(ctx, `SELECT e.id FROM endpoints e
		JOIN endpoint_subscriptions s ON s.endpoint_id = e.id
		WHERE e.project_id = $1 AND e.enabled AND e.verified_at IS NOT NULL
		AND e.deleted_at IS NULL AND s.event_type = $2 ORDER BY e.id`, projectID, eventType)
	if err != nil {
		return 0, fmt.Errorf("find event subscribers: %w", err)
	}
	endpointIDs, err := pgx.CollectRows(rows, pgx.RowTo[pgtype.UUID])
	if err != nil {
		return 0, fmt.Errorf("read event subscribers: %w", err)
	}
	if len(endpointIDs) == 0 {
		return 0, nil
	}
	deliveryIDs := make([]pgtype.UUID, len(endpointIDs))
	for i := range deliveryIDs {
		id, err := uuid.NewV7()
		if err != nil {
			return 0, fmt.Errorf("generate delivery ID: %w", err)
		}
		deliveryIDs[i] = pgtype.UUID{Bytes: [16]byte(id), Valid: true}
	}
	result, err := tx.Exec(ctx, `INSERT INTO deliveries (id, project_id, event_id, endpoint_id)
		SELECT jobs.id, $1, $2, jobs.endpoint_id
		FROM unnest($3::uuid[], $4::uuid[]) AS jobs(id, endpoint_id)`,
		projectID, eventID, deliveryIDs, endpointIDs)
	if err != nil {
		return 0, fmt.Errorf("create event deliveries: %w", err)
	}
	if result.RowsAffected() != int64(len(endpointIDs)) {
		return 0, fmt.Errorf("delivery fan-out count did not match subscriber count")
	}
	return len(endpointIDs), nil
}
