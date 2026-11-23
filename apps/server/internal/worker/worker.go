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
	if err := options.validate(); err != nil {
		return err
	}
	ownerID, err := uuid.NewV7()
	if err != nil {
		return fmt.Errorf("generate worker lease owner: %w", err)
	}
	logger = logger.With("worker_id", ownerID)
	logger.Info(
		"worker started",
		"concurrency", options.Concurrency,
		"destination_concurrency", options.DestinationConcurrency,
		"claim_batch_size", options.ClaimBatchSize,
		"poll_interval", options.PollInterval.String(),
	)
	workCtx, cancelWork := context.WithCancel(context.WithoutCancel(ctx))
	defer cancelWork()
	p := &pool{
		options: options, db: db, outbound: outbound, vault: vault, logger: logger,
		ownerID: ownerID, workCtx: workCtx,
		done:   make(chan finishedJob, options.Concurrency),
		active: make(map[uuid.UUID]int),
	}
	runErr := p.dispatch(ctx)
	if runErr != nil {
		cancelWork()
	}
	logger.Info("worker stopping claims", "in_flight", p.inFlight)
	p.drain(cancelWork)
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

func (options Options) validate() error {
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
	return nil
}

// pool is owned by the goroutine running Run. Job goroutines only send on done.
type pool struct {
	options  Options
	db       Queue
	outbound *delivery.Client
	vault    *signing.Vault
	logger   *slog.Logger
	ownerID  uuid.UUID
	workCtx  context.Context
	done     chan finishedJob
	workers  sync.WaitGroup
	active   map[uuid.UUID]int
	inFlight int
}

// dispatch claims and starts work until ctx is canceled or a job fails fatally.
func (p *pool) dispatch(ctx context.Context) error {
	poll := time.NewTicker(p.options.PollInterval)
	defer poll.Stop()
	maintenance := time.NewTicker(5 * time.Second)
	defer maintenance.Stop()
	maintainQueue(ctx, p.db, p.logger, p.options.Metrics)
	fill := true
	for ctx.Err() == nil {
		if fill {
			p.fill(ctx)
			fill = false
		}
		select {
		case <-ctx.Done():
			return nil
		case <-poll.C:
			fill = true
		case result := <-p.done:
			p.inFlight--
			p.active[result.endpointID]--
			if p.active[result.endpointID] == 0 {
				delete(p.active, result.endpointID)
			}
			if result.fatal != nil {
				return result.fatal
			}
			fill = true
		case <-maintenance.C:
			maintainQueue(ctx, p.db, p.logger, p.options.Metrics)
		}
	}
	return nil
}

// fill claims batches until the pool is full, the queue has no more due work,
// or a claim fails.
func (p *pool) fill(ctx context.Context) {
	options := p.options
	for p.inFlight < options.Concurrency && ctx.Err() == nil {
		excluded := make([]uuid.UUID, 0, len(p.active))
		for id, count := range p.active {
			if count >= options.DestinationConcurrency {
				excluded = append(excluded, id)
			}
		}
		limit := min(options.ClaimBatchSize, options.Concurrency-p.inFlight)
		claimCtx, stop := context.WithTimeout(ctx, queueOperationTimeout)
		claimStarted := time.Now()
		jobs, err := p.db.ClaimDeliveries(claimCtx, p.ownerID, limit, excluded)
		stop()
		options.Metrics.Operation("claim", claimStarted, err)
		if err != nil {
			if ctx.Err() == nil {
				p.logger.Warn("delivery claim failed", "error", err)
			}
			return
		}
		options.Metrics.Claimed(len(jobs))
		for _, job := range jobs {
			if ctx.Err() != nil {
				break
			}
			if p.active[job.EndpointID] >= options.DestinationConcurrency {
				p.release(ctx, job)
				continue
			}
			p.start(job)
		}
		if len(jobs) < limit {
			return
		}
	}
}

// release returns a claimed job whose destination is already at its limit.
func (p *pool) release(ctx context.Context, job deliveries.Job) {
	releaseCtx, cancel := context.WithTimeout(ctx, queueOperationTimeout)
	started := time.Now()
	_, err := p.db.ReleaseDelivery(releaseCtx, job.Lease, p.options.PollInterval)
	cancel()
	p.options.Metrics.Operation("release_reservation", started, err)
	if err != nil && ctx.Err() == nil && !errors.Is(err, deliveries.ErrLeaseLost) {
		p.logger.Warn("unsent delivery release failed", "delivery_id", job.DeliveryID, "error", err)
	}
}

func (p *pool) start(job deliveries.Job) {
	metrics := p.options.Metrics
	p.active[job.EndpointID]++
	p.inFlight++
	metrics.JobStarted()
	p.workers.Go(func() {
		defer metrics.JobFinished()
		err := processDelivery(p.workCtx, p.db, p.outbound, p.vault, job, p.logger, metrics)
		if err != nil {
			metrics.Error("credential_decryption")
		}
		p.done <- finishedJob{endpointID: job.EndpointID, fatal: err}
	})
}

// drain waits for active jobs, canceling their requests at the shutdown deadline.
func (p *pool) drain(cancelWork context.CancelFunc) {
	drained := make(chan struct{})
	go func() {
		p.workers.Wait()
		close(drained)
	}()
	drainTimer := time.NewTimer(p.options.ShutdownTimeout)
	defer drainTimer.Stop()
	select {
	case <-drained:
	case <-drainTimer.C:
		p.logger.Warn("worker drain deadline reached; canceling active requests")
		cancelWork()
		// Database finalization/rollback remains bounded after network cancellation.
		settle := time.NewTimer(2 * queueOperationTimeout)
		defer settle.Stop()
		select {
		case <-drained:
		case <-settle.C:
			p.logger.Warn("worker finalization deadline reached; releasing remaining leases")
		}
	}
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
