package deliveries

import "time"

// QueueStats counts all active rows, including pending jobs blocked by project
// or endpoint configuration. Due and expired leases are subsets of their states.
type QueueStats struct {
	SampledAt                           time.Time
	Pending, Due, Leased, ExpiredLeases int64
	OldestDueAge                        time.Duration
}
