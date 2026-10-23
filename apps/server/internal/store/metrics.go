package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"cascadehook/internal/deliveries"
)

// PoolStats reads local counters without opening a database connection.
func (s *Store) PoolStats() *pgxpool.Stat {
	return s.pool.Stat()
}

// QueueStats reads only active queue states. Existing partial queue indexes
// cover these predicates; terminal delivery history is not counted or locked.
func (s *Store) QueueStats(ctx context.Context) (deliveries.QueueStats, error) {
	var stats deliveries.QueueStats
	var oldestSeconds float64
	err := s.pool.QueryRow(ctx, `WITH pending AS (
		SELECT count(*) AS total,
			count(*) FILTER (WHERE next_attempt_at <= statement_timestamp()) AS due,
			greatest(extract(epoch FROM (statement_timestamp() - min(next_attempt_at))), 0)::double precision AS oldest
		FROM deliveries WHERE state = 'pending'
	), leased AS (
		SELECT count(*) AS total,
			count(*) FILTER (WHERE lease_expires_at <= statement_timestamp()) AS expired
		FROM deliveries WHERE state = 'leased'
	) SELECT statement_timestamp(), pending.total, pending.due, leased.total, leased.expired, pending.oldest
		FROM pending CROSS JOIN leased`).Scan(
		&stats.SampledAt, &stats.Pending, &stats.Due, &stats.Leased, &stats.ExpiredLeases, &oldestSeconds,
	)
	if err != nil {
		return deliveries.QueueStats{}, fmt.Errorf("read queue metrics: %w", err)
	}
	stats.OldestDueAge = time.Duration(oldestSeconds * float64(time.Second))
	return stats, nil
}
