// Package worker runs queue maintenance. Dispatch will be enabled when the
// signed HTTPS sender and attempt recorder are ready; maintenance never claims
// jobs that it cannot actually process.
package worker

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"cascadehook/internal/deliveries"
)

// QueueMaintenance is satisfied by *store.Store. Recovery is bounded so a large
// backlog cannot keep one tick or shutdown waiting indefinitely.
type QueueMaintenance interface {
	RecoverDeliveryLeases(ctx context.Context, limit int) (int64, error)
	ExpirePendingDeliveries(ctx context.Context, limit int) (int64, error)
	ReleaseWorkerLeases(ctx context.Context, ownerID uuid.UUID) (int64, error)
}

type Options struct {
	PollInterval    time.Duration
	ShutdownTimeout time.Duration
}

const queueOperationTimeout = 5 * time.Second

// Run recovers expired leases and retires exhausted pending work at startup
// and on every tick. Database failures are retried on the next tick. On exit,
// lease cleanup has its own timeout independent of the canceled signal context.
func Run(ctx context.Context, options Options, db QueueMaintenance, logger *slog.Logger) (runErr error) {
	if options.PollInterval <= 0 {
		return fmt.Errorf("worker poll interval must be positive, got %s", options.PollInterval)
	}
	if options.ShutdownTimeout <= 0 {
		return fmt.Errorf("worker shutdown timeout must be positive, got %s", options.ShutdownTimeout)
	}
	ownerID, err := uuid.NewV7()
	if err != nil {
		return fmt.Errorf("generate worker lease owner: %w", err)
	}
	logger = logger.With("worker_id", ownerID)
	logger.Info("worker started", "poll_interval", options.PollInterval.String(), "mode", "queue_maintenance")
	defer func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), options.ShutdownTimeout)
		defer cancel()
		released, err := db.ReleaseWorkerLeases(cleanupCtx, ownerID)
		if err != nil {
			runErr = err
			return
		}
		logger.Info("worker stopped", "leases_released", released)
	}()

	ticker := time.NewTicker(options.PollInterval)
	defer ticker.Stop()
	for {
		if ctx.Err() != nil {
			return nil
		}
		recoveryCtx, cancel := context.WithTimeout(ctx, queueOperationTimeout)
		recovered, err := db.RecoverDeliveryLeases(recoveryCtx, deliveries.MaxClaimBatch)
		cancel()
		if err != nil && ctx.Err() == nil {
			logger.Warn("delivery lease recovery failed", "error", err)
		} else if recovered > 0 {
			logger.Info("delivery leases recovered", "count", recovered)
		}
		if ctx.Err() != nil {
			return nil
		}
		expiryCtx, cancel := context.WithTimeout(ctx, queueOperationTimeout)
		expired, err := db.ExpirePendingDeliveries(expiryCtx, deliveries.MaxClaimBatch)
		cancel()
		if err != nil && ctx.Err() == nil {
			logger.Warn("pending delivery expiry failed", "error", err)
		} else if expired > 0 {
			logger.Info("pending deliveries expired", "count", expired)
		}

		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}
