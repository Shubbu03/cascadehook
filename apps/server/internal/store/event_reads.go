package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/events"
)

const eventSummaryColumns = `e.id, e.project_id, e.event_type, e.delivery_count, e.created_at`

func (s *Store) ListEvents(ctx context.Context, projectID uuid.UUID, options events.ListOptions) ([]events.Summary, error) {
	if err := options.Options.Validate(); err != nil {
		return nil, err
	}
	if options.EventType != "" && !events.ValidType(options.EventType) {
		return nil, events.ErrInvalidType
	}
	query := `SELECT ` + eventSummaryColumns + ` FROM events e WHERE e.project_id = $1 AND e.purge_started_at IS NULL
		AND EXISTS (SELECT 1 FROM projects p WHERE p.id = e.project_id AND p.deletion_requested_at IS NULL)`
	args := []any{projectID}
	if options.EventType != "" {
		args = append(args, options.EventType)
		query += fmt.Sprintf(` AND e.event_type = $%d`, len(args))
	}
	if options.Before != nil {
		args = append(args, options.Before.CreatedAt, options.Before.ID)
		query += fmt.Sprintf(` AND (e.created_at, e.id) < ($%d, $%d)`, len(args)-1, len(args))
	}
	args = append(args, options.Limit+1)
	query += fmt.Sprintf(` ORDER BY e.created_at DESC, e.id DESC LIMIT $%d`, len(args))
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list events: %w", err)
	}
	result, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (events.Summary, error) {
		var event events.Summary
		err := row.Scan(&event.ID, &event.ProjectID, &event.Type, &event.DeliveryCount, &event.CreatedAt)
		return event, err
	})
	if err != nil {
		return nil, fmt.Errorf("read event summaries: %w", err)
	}
	return result, nil
}

func (s *Store) GetEvent(ctx context.Context, projectID, id uuid.UUID) (events.Event, error) {
	var event events.Event
	var payload []byte
	err := s.pool.QueryRow(ctx, `SELECT `+eventSummaryColumns+`, e.payload FROM events e
		WHERE e.project_id = $1 AND e.id = $2 AND e.purge_started_at IS NULL
		AND EXISTS (SELECT 1 FROM projects p WHERE p.id = e.project_id AND p.deletion_requested_at IS NULL)`, projectID, id,
	).Scan(&event.ID, &event.ProjectID, &event.Type, &event.DeliveryCount, &event.CreatedAt, &payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return events.Event{}, events.ErrNotFound
	}
	if err != nil {
		return events.Event{}, fmt.Errorf("get event: %w", err)
	}
	event.Payload = json.RawMessage(payload)
	return event, nil
}
