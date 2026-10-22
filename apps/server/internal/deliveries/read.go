package deliveries

import (
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"

	"cascadehook/internal/pagination"
)

var ErrNotFound = errors.New("delivery not found")

// Delivery is the public queue view. Lease credentials and destination secrets
// are deliberately absent. NextAttemptAt is set only while pending.
type Delivery struct {
	ID                     uuid.UUID  `json:"id"`
	ProjectID              uuid.UUID  `json:"project_id"`
	EventID                uuid.UUID  `json:"event_id"`
	EndpointID             uuid.UUID  `json:"endpoint_id"`
	State                  State      `json:"state"`
	AttemptCount           int        `json:"attempt_count"`
	Cycle                  int        `json:"cycle"`
	CycleStartedAt         time.Time  `json:"cycle_started_at"`
	RetryDeadline          time.Time  `json:"retry_deadline"`
	NextAttemptAt          *time.Time `json:"next_attempt_at"`
	TerminalReason         *string    `json:"terminal_reason"`
	ActiveAttemptID        *uuid.UUID `json:"active_attempt_id"`
	ActiveAttemptStartedAt *time.Time `json:"active_attempt_started_at"`
	LeaseExpiresAt         *time.Time `json:"lease_expires_at"`
	CreatedAt              time.Time  `json:"created_at"`
	UpdatedAt              time.Time  `json:"updated_at"`
}

func ValidState(state State) bool {
	switch state {
	case Pending, Leased, Succeeded, Failed, Canceled:
		return true
	default:
		return false
	}
}

type ListOptions struct {
	pagination.Options
	EventID    *uuid.UUID
	EndpointID *uuid.UUID
	State      State
}

// AttemptRecord exposes completed history, including recovered interruptions.
// It never includes lease tokens/owners, response bodies, or sensitive headers.
type AttemptRecord struct {
	ID                uuid.UUID  `json:"id"`
	ProjectID         uuid.UUID  `json:"project_id"`
	DeliveryID        uuid.UUID  `json:"delivery_id"`
	Cycle             int        `json:"cycle"`
	AttemptNumber     int        `json:"attempt_number"`
	StartedAt         time.Time  `json:"started_at"`
	FinishedAt        time.Time  `json:"finished_at"`
	DurationMS        int64      `json:"duration_ms"`
	StatusCode        *int       `json:"status_code"`
	Outcome           Outcome    `json:"outcome"`
	ErrorCode         *string    `json:"error_code"`
	ResponseTruncated bool       `json:"response_truncated"`
	ResponseReadError bool       `json:"response_read_error"`
	DeliveryState     State      `json:"delivery_state"`
	TerminalReason    *string    `json:"terminal_reason"`
	RetryAt           *time.Time `json:"retry_at"`
}

// AttemptCursor follows logical attempt order, independent of completion time.
// Binding it to its delivery prevents accidental reuse on another history page.
type AttemptCursor struct {
	DeliveryID    uuid.UUID `json:"delivery_id"`
	Cycle         int       `json:"cycle"`
	AttemptNumber int       `json:"attempt_number"`
}

func (cursor AttemptCursor) Valid(deliveryID uuid.UUID) bool {
	return cursor.DeliveryID == deliveryID && deliveryID != uuid.Nil &&
		cursor.Cycle >= 0 && cursor.Cycle <= math.MaxInt32 &&
		cursor.AttemptNumber > 0 && cursor.AttemptNumber <= math.MaxInt32
}

type AttemptListOptions struct {
	Limit  int
	Before *AttemptCursor
	Cycle  *int
}

func (options AttemptListOptions) Validate(deliveryID uuid.UUID) error {
	if options.Limit < 1 || options.Limit > pagination.MaxLimit {
		return fmt.Errorf("attempt page limit must be between 1 and %d", pagination.MaxLimit)
	}
	if options.Before != nil && !options.Before.Valid(deliveryID) {
		return fmt.Errorf("invalid attempt cursor")
	}
	if options.Cycle != nil && (*options.Cycle < 0 || *options.Cycle > math.MaxInt32) {
		return fmt.Errorf("invalid attempt cycle")
	}
	if options.Before != nil && options.Cycle != nil && options.Before.Cycle != *options.Cycle {
		return fmt.Errorf("attempt cursor does not match cycle filter")
	}
	return nil
}
