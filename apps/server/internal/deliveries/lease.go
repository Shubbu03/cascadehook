// Package deliveries defines the jobs and lease credentials used by the worker.
package deliveries

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

const (
	DefaultClaimBatch = 10
	MaxClaimBatch     = 100
	LeaseDuration     = 90 * time.Second
	MaxAttempts       = 8
	RetryHorizon      = 72 * time.Hour
)

var ErrLeaseLost = errors.New("delivery lease expired or no longer owned")

type State string

const (
	Pending   State = "pending"
	Succeeded State = "succeeded"
	Failed    State = "failed"
	Canceled  State = "canceled"
)

// Lease identifies one reservation, rather than just its delivery. A fresh
// token is assigned on every claim, even when the same worker reclaims a job.
type Lease struct {
	DeliveryID uuid.UUID
	OwnerID    uuid.UUID
	Token      uuid.UUID
}

// Job contains the immutable event bytes and destination snapshot at claim
// time. Claiming does not increment AttemptCount: reserving work is not an
// HTTP attempt. The sender must recheck destination eligibility before sending.
type Job struct {
	Lease
	ProjectID      uuid.UUID
	EventID        uuid.UUID
	EndpointID     uuid.UUID
	URL            string
	EventType      string
	Payload        []byte
	EventCreatedAt time.Time
	LeaseExpiresAt time.Time
	AttemptCount   int
	Cycle          int
}

// Completion describes only the queue transition. Attempt counting and the
// append-only attempt log will be integrated with completion by the sender.
// Pending requires a positive RetryAfter; terminal states require zero.
type Completion struct {
	State      State
	RetryAfter time.Duration
}
