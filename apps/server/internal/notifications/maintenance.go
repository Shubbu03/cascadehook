package notifications

import (
	"context"
	"log/slog"
	"time"
)

type ExpirySource interface {
	GenerateKeyExpiryNotifications(context.Context, int) (int, error)
}

// RunMaintenance is owned by the worker process and stops with its service.
// Failures are retried on the next tick; they never block delivery dispatch.
func RunMaintenance(ctx context.Context, source ExpirySource, logger *slog.Logger) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for ctx.Err() == nil {
		opCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		created, err := source.GenerateKeyExpiryNotifications(opCtx, 100)
		cancel()
		if err != nil && ctx.Err() == nil {
			logger.Warn("notification expiry maintenance failed", "error", err)
		} else if created > 0 {
			logger.Info("key expiry notifications created", "count", created)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
