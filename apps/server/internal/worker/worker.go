// Package worker dispatches leased deliveries through a bounded worker pool.
package worker

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"

	"cascadehook/internal/deliveries"
	"cascadehook/internal/delivery"
	"cascadehook/internal/signing"
)

type Queue interface {
	ClaimDeliveries(context.Context, uuid.UUID, int, []uuid.UUID) ([]deliveries.Job, error)
	BeginDeliveryAttempt(context.Context, deliveries.Job) (deliveries.Attempt, error)
	CompleteDelivery(context.Context, deliveries.Attempt, deliveries.Result) (deliveries.Completion, error)
	ReleaseDelivery(context.Context, deliveries.Lease, time.Duration) (deliveries.Completion, error)
	RecoverDeliveryLeases(context.Context, int) (int64, error)
	ExpirePendingDeliveries(context.Context, int) (int64, error)
	ReleaseWorkerLeases(context.Context, uuid.UUID) (int64, error)
}

type Options struct {
	PollInterval, ShutdownTimeout                       time.Duration
	Concurrency, DestinationConcurrency, ClaimBatchSize int
}

const queueOperationTimeout = 5 * time.Second

type finishedJob struct {
	endpointID uuid.UUID
	fatal      error
}

// Run stops claiming on cancellation, lets active requests drain, then cancels
// remaining work and releases this process's reservations using a fresh context.
func Run(ctx context.Context, options Options, db Queue, outbound *delivery.Client, vault *signing.Vault, logger *slog.Logger) error {
	if options.PollInterval < 100*time.Millisecond || options.PollInterval > time.Minute || options.ShutdownTimeout <= 0 {
		return fmt.Errorf("invalid worker poll/shutdown timing")
	}
	if options.Concurrency < 1 || options.Concurrency > deliveries.MaxConcurrency || options.DestinationConcurrency < 1 ||
		options.DestinationConcurrency > options.Concurrency || options.ClaimBatchSize < 1 || options.ClaimBatchSize > deliveries.MaxClaimBatch {
		return fmt.Errorf("invalid worker concurrency or batch size")
	}
	ownerID, err := uuid.NewV7()
	if err != nil {
		return fmt.Errorf("generate worker lease owner: %w", err)
	}
	logger = logger.With("worker_id", ownerID)
	logger.Info("worker started", "concurrency", options.Concurrency, "destination_concurrency", options.DestinationConcurrency,
		"claim_batch_size", options.ClaimBatchSize, "poll_interval", options.PollInterval.String())
	workCtx, cancelWork := context.WithCancel(context.WithoutCancel(ctx))
	defer cancelWork()
	done := make(chan finishedJob, options.Concurrency)
	var workers sync.WaitGroup
	active := make(map[uuid.UUID]int)
	inFlight := 0
	poll := time.NewTicker(options.PollInterval)
	defer poll.Stop()
	maintenance := time.NewTicker(5 * time.Second)
	defer maintenance.Stop()
	maintainQueue(ctx, db, logger)
	var runErr error
	fill := true
	running := true
	for running && ctx.Err() == nil {
		if fill {
			for inFlight < options.Concurrency && ctx.Err() == nil {
				excluded := make([]uuid.UUID, 0, len(active))
				for id, count := range active {
					if count >= options.DestinationConcurrency {
						excluded = append(excluded, id)
					}
				}
				limit := min(options.ClaimBatchSize, options.Concurrency-inFlight)
				claimCtx, stop := context.WithTimeout(ctx, queueOperationTimeout)
				jobs, err := db.ClaimDeliveries(claimCtx, ownerID, limit, excluded)
				stop()
				if err != nil {
					if ctx.Err() == nil {
						logger.Warn("delivery claim failed", "error", err)
					}
					break
				}
				for _, job := range jobs {
					if ctx.Err() != nil {
						break
					}
					if active[job.EndpointID] >= options.DestinationConcurrency {
						releaseCtx, releaseCancel := context.WithTimeout(ctx, queueOperationTimeout)
						_, err := db.ReleaseDelivery(releaseCtx, job.Lease, options.PollInterval)
						releaseCancel()
						if err != nil && ctx.Err() == nil && !errors.Is(err, deliveries.ErrLeaseLost) {
							logger.Warn("unsent delivery release failed", "delivery_id", job.DeliveryID, "error", err)
						}
						continue
					}
					active[job.EndpointID]++
					inFlight++
					workers.Add(1)
					go func(job deliveries.Job) {
						defer workers.Done()
						err := processDelivery(workCtx, db, outbound, vault, job, logger)
						done <- finishedJob{endpointID: job.EndpointID, fatal: err}
					}(job)
				}
				if len(jobs) < limit {
					break
				}
			}
			fill = false
		}
		select {
		case <-ctx.Done():
			running = false
		case <-poll.C:
			fill = true
		case result := <-done:
			inFlight--
			active[result.endpointID]--
			if active[result.endpointID] == 0 {
				delete(active, result.endpointID)
			}
			if result.fatal != nil {
				runErr = result.fatal
				cancelWork()
				running = false
			} else {
				fill = true
			}
		case <-maintenance.C:
			maintainQueue(ctx, db, logger)
		}
	}
	logger.Info("worker stopping claims", "in_flight", inFlight)
	drained := make(chan struct{})
	go func() { workers.Wait(); close(drained) }()
	drainTimer := time.NewTimer(options.ShutdownTimeout)
	select {
	case <-drained:
		drainTimer.Stop()
	case <-drainTimer.C:
		logger.Warn("worker drain deadline reached; canceling active requests")
		cancelWork()
		// Database finalization/rollback remains bounded after network cancellation.
		settle := time.NewTimer(2 * queueOperationTimeout)
		select {
		case <-drained:
			settle.Stop()
		case <-settle.C:
			logger.Warn("worker finalization deadline reached; releasing remaining leases")
		}
	}
	cancelWork()
	cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), queueOperationTimeout)
	defer cleanupCancel()
	released, cleanupErr := db.ReleaseWorkerLeases(cleanupCtx, ownerID)
	logger.Info("worker stopped", "leases_released", released)
	return errors.Join(runErr, cleanupErr)
}

func maintainQueue(ctx context.Context, db Queue, logger *slog.Logger) {
	if ctx.Err() != nil {
		return
	}
	opCtx, cancel := context.WithTimeout(ctx, queueOperationTimeout)
	recovered, err := db.RecoverDeliveryLeases(opCtx, deliveries.MaxClaimBatch)
	cancel()
	if err != nil && ctx.Err() == nil {
		logger.Warn("delivery lease recovery failed", "error", err)
	} else if recovered > 0 {
		logger.Info("delivery leases recovered", "count", recovered)
	}
	if ctx.Err() != nil {
		return
	}
	opCtx, cancel = context.WithTimeout(ctx, queueOperationTimeout)
	expired, err := db.ExpirePendingDeliveries(opCtx, deliveries.MaxClaimBatch)
	cancel()
	if err != nil && ctx.Err() == nil {
		logger.Warn("pending delivery expiry failed", "error", err)
	} else if expired > 0 {
		logger.Info("pending deliveries expired", "count", expired)
	}
}
