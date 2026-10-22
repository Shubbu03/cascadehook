package events

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"

	"cascadehook/internal/pagination"
)

var ErrNotFound = errors.New("event not found")

// Summary omits payload bytes so a bounded list stays small even for large events.
type Summary struct {
	ID            uuid.UUID `json:"id"`
	ProjectID     uuid.UUID `json:"project_id"`
	Type          string    `json:"type"`
	DeliveryCount int       `json:"delivery_count"`
	CreatedAt     time.Time `json:"created_at"`
}

type Event struct {
	Summary
	Payload json.RawMessage `json:"payload"`
}

type ListOptions struct {
	pagination.Options
	EventType string
}
