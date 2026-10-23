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
	"cascadehook/internal/telemetry"
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
	Metrics                                             *telemetry.Worker
}

const queueOperationTimeout = 5 * time.Second

type finishedJob struct {
	endpointID uuid.UUID
	fatal      error
}

// Run stops claiming on cancellation, lets active requests drain, then cancels
// remaining work and releases this process's reservations using a fresh context.
func Run(
	ctx context.Context,
	options Options,
	db Queue,
	outbound *delivery.Client,
	vault *signing.Vault,
	logger *slog.Logger,
) error {
	invalidPollInterval := options.PollInterval < 100*time.Millisecond || options.PollInterval > time.Minute
	if invalidPollInterval || options.ShutdownTimeout <= 0 {
		return fmt.Errorf("invalid worker poll/shutdown timing")
	}
	invalidConcurrency := options.Concurrency < 1 || options.Concurrency > deliveries.MaxConcurrency
	invalidDestinationConcurrency := options.DestinationConcurrency < 1 || options.DestinationConcurrency > options.Concurrency
	invalidBatchSize := options.ClaimBatchSize < 1 || options.ClaimBatchSize > deliveries.MaxClaimBatch
	if invalidConcurrency || invalidDestinationConcurrency || invalidBatchSize {
		return fmt.Errorf("invalid worker concurrency or batch size")
	}
	ownerID, err := uuid.NewV7()
	if err != nil {
		return fmt.Errorf("generate worker lease owner: %w", err)
	}
	logger = logger.With("worker_id", ownerID)
	logger.Info(
		"worker started",
		"concurrency",
		options.Concurrency,
		"destination_concurrency",
		options.DestinationConcurrency,
		"claim_batch_size",
		options.ClaimBatchSize,
		"poll_interval",
		options.PollInterval.String(),
	)
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
	maintainQueue(
		ctx,
		db,
		logger,
		options.Metrics,
	)
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
				claimStarted := time.Now()
				jobs, err := db.ClaimDeliveries(
					claimCtx,
					ownerID,
					limit,
					excluded,
				)
				stop()
				options.Metrics.Operation("claim", claimStarted, err)
				if err != nil {
					if ctx.Err() == nil {
						logger.Warn("delivery claim failed", "error", err)
					}
					break
				}
				options.Metrics.Claimed(len(jobs))
				for _, job := range jobs {
					if ctx.Err() != nil {
						break
					}
					if active[job.EndpointID] >= options.DestinationConcurrency {
						releaseCtx, releaseCancel := context.WithTimeout(ctx, queueOperationTimeout)
						releaseStarted := time.Now()
						_, err := db.ReleaseDelivery(releaseCtx, job.Lease, options.PollInterval)
						releaseCancel()
						options.Metrics.Operation("release_reservation", releaseStarted, err)
						if err != nil && ctx.Err() == nil && !errors.Is(err, deliveries.ErrLeaseLost) {
							logger.Warn(
								"unsent delivery release failed",
								"delivery_id",
								job.DeliveryID,
								"error",
								err,
							)
						}
						continue
					}
					active[job.EndpointID]++
					inFlight++
					options.Metrics.JobStarted()
					workers.Go(func() {
						defer options.Metrics.JobFinished()
						err := processDelivery(
							workCtx,
							db,
							outbound,
							vault,
							job,
							logger,
							options.Metrics,
						)
						if err != nil {
							options.Metrics.Error("credential_decryption")
						}
						done <- finishedJob{endpointID: job.EndpointID, fatal: err}
					})
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
				break
			}
			fill = true
		case <-maintenance.C:
			maintainQueue(
				ctx,
				db,
				logger,
				options.Metrics,
			)
		}
	}
	logger.Info("worker stopping claims", "in_flight", inFlight)
	drained := make(chan struct{})
	go func() {
		workers.Wait()
		close(drained)
	}()
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
	cleanupStarted := time.Now()
	released, cleanupErr := db.ReleaseWorkerLeases(cleanupCtx, ownerID)
	options.Metrics.Operation("release_worker", cleanupStarted, cleanupErr)
	options.Metrics.Maintenance("release_worker", released)
	logger.Info("worker stopped", "leases_released", released)
	return errors.Join(runErr, cleanupErr)
}

func maintainQueue(ctx context.Context, db Queue, logger *slog.Logger, metrics *telemetry.Worker) {
	if ctx.Err() != nil {
		return
	}
	opCtx, cancel := context.WithTimeout(ctx, queueOperationTimeout)
	started := time.Now()
	recovered, err := db.RecoverDeliveryLeases(opCtx, deliveries.MaxClaimBatch)
	cancel()
	metrics.Operation("recover_leases", started, err)
	metrics.Maintenance("recover_leases", recovered)
	if err != nil && ctx.Err() == nil {
		logger.Warn("delivery lease recovery failed", "error", err)
	} else if recovered > 0 {
		logger.Info("delivery leases recovered", "count", recovered)
	}
	if ctx.Err() != nil {
		return
	}
	opCtx, cancel = context.WithTimeout(ctx, queueOperationTimeout)
	started = time.Now()
	expired, err := db.ExpirePendingDeliveries(opCtx, deliveries.MaxClaimBatch)
	cancel()
	metrics.Operation("expire_pending", started, err)
	metrics.Maintenance("expire_pending", expired)
	if err != nil && ctx.Err() == nil {
		logger.Warn("pending delivery expiry failed", "error", err)
	} else if expired > 0 {
		logger.Info("pending deliveries expired", "count", expired)
	}
}
