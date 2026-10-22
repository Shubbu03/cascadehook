// Package pagination defines the shared keyset coordinates for resource lists.
package pagination

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

const (
	DefaultLimit = 20
	MaxLimit     = 100
)

type Cursor struct {
	CreatedAt time.Time `json:"created_at"`
	ID        uuid.UUID `json:"id"`
}

func (cursor Cursor) Valid() bool {
	return !cursor.CreatedAt.IsZero() && cursor.ID != uuid.Nil
}

type Options struct {
	Limit  int
	Before *Cursor
}

func (options Options) Validate() error {
	if options.Limit < 1 || options.Limit > MaxLimit {
		return fmt.Errorf("page limit must be between 1 and %d", MaxLimit)
	}
	if options.Before != nil && !options.Before.Valid() {
		return fmt.Errorf("invalid page cursor")
	}
	return nil
}
