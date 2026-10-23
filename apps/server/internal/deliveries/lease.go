// Package deliveries defines the jobs and lease credentials used by the worker.
package deliveries

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

const (
	DefaultClaimBatch             = 10
	MaxClaimBatch                 = 100
	LeaseDuration                 = 90 * time.Second
	MaxAttempts                   = 8
	RetryHorizon                  = 72 * time.Hour
	DefaultConcurrency            = 32
	DefaultDestinationConcurrency = 4
	MaxConcurrency                = 256
	AttemptTimeout                = 30 * time.Second
)

var (
	ErrLeaseLost      = errors.New("delivery lease expired or no longer owned")
	ErrAttemptStarted = errors.New("delivery lease already has an active attempt")
)

type State string

const (
	Pending   State = "pending"
	Leased    State = "leased"
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
	ProjectID               uuid.UUID
	EventID                 uuid.UUID
	EndpointID              uuid.UUID
	URL                     string
	EventType               string
	Payload                 []byte
	EventCreatedAt          time.Time
	NextAttemptAt           time.Time
	LeaseExpiresAt          time.Time
	AttemptCount            int
	Cycle                   int
	ConfigurationVersion    int64
	SigningSecret           []byte `json:"-"`
	PreviousSigningSecret   []byte `json:"-"`
	PreviousSecretExpiresAt *time.Time
}

// Completion is the committed queue transition, including the retry timestamp
// chosen from database time. A nil NextAttemptAt denotes a terminal state.
type Completion struct {
	State          State
	NextAttemptAt  *time.Time
	TerminalReason string
}
