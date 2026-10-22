package deliveries

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

type Outcome string

const (
	OutcomeSucceeded   Outcome = "succeeded"
	OutcomeRetryable   Outcome = "retryable"
	OutcomeTerminal    Outcome = "terminal"
	OutcomeInterrupted Outcome = "interrupted"
)

// Attempt is a durable dispatch intent. A zero ID means the reservation was
// released after eligibility changed and no network attempt should be made.
type Attempt struct {
	Lease
	ID                uuid.UUID
	Number            int
	Cycle             int
	StartedAt         time.Time
	Timeout           time.Duration
	UsePreviousSecret bool
}

// Result contains only bounded metadata. Payloads, destination URLs, raw error
// messages, headers, and response bodies never enter the attempt history.
type Result struct {
	Outcome           Outcome
	StatusCode        int
	ErrorCode         string
	Duration          time.Duration
	ResponseTruncated bool
	ResponseReadError bool
	RetryDelay        time.Duration
	RetryAfterDelay   time.Duration
	RetryAfterAt      *time.Time
}

func (result Result) Validate() error {
	if result.Duration < 0 || result.StatusCode < 0 || result.StatusCode > 999 || (result.StatusCode > 0 && result.StatusCode < 100) {
		return fmt.Errorf("invalid delivery attempt metadata")
	}
	switch result.Outcome {
	case OutcomeSucceeded:
		if result.StatusCode < 200 || result.StatusCode >= 300 {
			return fmt.Errorf("successful attempt requires a 2xx status")
		}
	case OutcomeRetryable, OutcomeTerminal, OutcomeInterrupted:
	default:
		return fmt.Errorf("invalid delivery attempt outcome")
	}
	switch result.ErrorCode {
	case "", "http_status", "unsafe_destination", "timeout", "network_error", "worker_shutdown", "lease_expired":
	default:
		return fmt.Errorf("invalid delivery attempt error code")
	}
	if result.RetryDelay < 0 || result.RetryDelay > RetryHorizon || result.RetryAfterDelay < 0 || result.RetryAfterDelay > RetryHorizon {
		return fmt.Errorf("invalid delivery retry delay")
	}
	if result.Outcome == OutcomeRetryable && result.RetryDelay <= 0 {
		return fmt.Errorf("retryable attempt requires a positive retry delay")
	}
	return nil
}

// RetryAt uses a timestamp obtained from PostgreSQL, never the worker's wall
// clock. Retry-After is a minimum wait; a hint beyond the horizon exhausts the
// delivery instead of causing a request earlier than the receiver requested.
func (result Result) RetryAt(databaseNow time.Time) time.Time {
	delay := max(result.RetryDelay, result.RetryAfterDelay)
	at := databaseNow.Add(delay)
	if result.RetryAfterAt != nil && result.RetryAfterAt.After(at) {
		at = *result.RetryAfterAt
	}
	return at
}
