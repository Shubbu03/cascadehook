package deliveries

import (
	"errors"
	"math"
	"time"

	"github.com/google/uuid"
)

var (
	ErrInvalidReplayCycle     = errors.New("expected replay cycle must be a nonnegative PostgreSQL integer")
	ErrReplayCycleChanged     = errors.New("delivery cycle has changed")
	ErrReplayNotAllowed       = errors.New("only succeeded or failed deliveries can be replayed")
	ErrReplayEndpointNotReady = errors.New("replay requires an enabled, verified, undeleted destination with a signing secret")
	ErrReplayCycleLimit       = errors.New("delivery cycle limit reached")
)

func ValidateReplayCycle(cycle int) error {
	if cycle < 0 || cycle > math.MaxInt32 {
		return ErrInvalidReplayCycle
	}
	return nil
}

// Replay is an immutable acceptance receipt, not a snapshot of current queue
// state. The same delivery/from-cycle request always returns its first receipt.
type Replay struct {
	ID            uuid.UUID `json:"id"`
	DeliveryID    uuid.UUID `json:"delivery_id"`
	FromCycle     int       `json:"from_cycle"`
	Cycle         int       `json:"cycle"`
	CreatedAt     time.Time `json:"created_at"`
	RetryDeadline time.Time `json:"retry_deadline"`
	Replayed      bool      `json:"-"`
}
