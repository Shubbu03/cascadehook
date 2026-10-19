// Package worker runs the delivery loop: claim due deliveries, send signed
// HTTPS requests, and record results. Claiming is not implemented yet, so Run
// only pings PostgreSQL on each tick to make the process lifecycle real
// before the queue lands.
package worker

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

// Pinger reports whether the database is reachable. It is satisfied by
// *store.Store.
type Pinger interface {
	Ping(ctx context.Context) error
}

// pingTimeout bounds a single database check so a stalled connection cannot
// delay the next tick indefinitely.
const pingTimeout = 2 * time.Second

// Run pings the database every interval until ctx is canceled, then returns
// nil. Ping failures are logged and retried on the next tick; a transient
// database outage must not kill the worker.
func Run(ctx context.Context, interval time.Duration, db Pinger, logger *slog.Logger) error {
	if interval <= 0 {
		return fmt.Errorf("worker poll interval must be positive, got %s", interval)
	}
	logger.Info("worker started", "poll_interval", interval.String())

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			logger.Info("worker stopped")
			return nil
		case <-ticker.C:
			pingCtx, cancel := context.WithTimeout(ctx, pingTimeout)
			err := db.Ping(pingCtx)
			cancel()
			if err != nil {
				// Shutdown cancels the parent context; that is not a ping failure.
				if ctx.Err() == nil {
					logger.Warn("database ping failed", "error", err)
				}
			} else {
				logger.Debug("worker tick")
			}
		}
	}
}
