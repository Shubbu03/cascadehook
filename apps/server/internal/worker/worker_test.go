package worker

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"testing/synctest"
	"time"

	"github.com/google/uuid"

	"cascadehook/internal/deliveries"
	"cascadehook/internal/signing"
)

type shutdownQueue struct {
	job      deliveries.Job
	claimed  bool
	started  chan struct{}
	released bool
}

var _ Queue = (*shutdownQueue)(nil)

func (q *shutdownQueue) ClaimDeliveries(
	ctx context.Context,
	owner uuid.UUID,
	_ int,
	_ []uuid.UUID,
) ([]deliveries.Job, error) {
	if q.claimed {
		return []deliveries.Job{}, nil
	}
	q.claimed = true
	q.job.OwnerID = owner
	return []deliveries.Job{q.job}, ctx.Err()
}

func (q *shutdownQueue) BeginDeliveryAttempt(ctx context.Context, _ deliveries.Job) (deliveries.Attempt, error) {
	close(q.started)
	<-ctx.Done()
	return deliveries.Attempt{}, ctx.Err()
}

func (*shutdownQueue) CompleteDelivery(
	context.Context,
	deliveries.Attempt,
	deliveries.Result,
) (deliveries.Completion, error) {
	panic("no HTTP attempt should have started")
}

func (*shutdownQueue) ReleaseDelivery(context.Context, deliveries.Lease, time.Duration) (deliveries.Completion, error) {
	panic("the claimed delivery should drain before cleanup")
}

func (*shutdownQueue) RecoverDeliveryLeases(context.Context, int) (int64, error) { return 0, nil }

func (*shutdownQueue) ExpirePendingDeliveries(context.Context, int) (int64, error) { return 0, nil }

func (q *shutdownQueue) ReleaseWorkerLeases(ctx context.Context, _ uuid.UUID) (int64, error) {
	if _, ok := ctx.Deadline(); !ok {
		panic("lease cleanup must have a deadline")
	}
	q.released = true
	return 1, ctx.Err()
}

func TestRunDrainsThenCancelsActiveWork(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		vault, err := signing.NewVault(make([]byte, signing.SecretSize))
		if err != nil {
			t.Fatal(err)
		}
		secret, err := signing.NewSecret()
		if err != nil {
			t.Fatal(err)
		}
		job := deliveries.Job{
			DeliveryID: uuid.New(),
			ProjectID:  uuid.New(), EndpointID: uuid.New(),
		}
		job.SigningSecret = vault.Encrypt(job.ProjectID, job.EndpointID, secret)
		queue := &shutdownQueue{job: job, started: make(chan struct{})}
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()
		result := make(chan error, 1)
		go func() {
			result <- Run(
				ctx,
				Options{
					PollInterval: time.Second, ShutdownTimeout: 2 * time.Second,
					Concurrency: 1, DestinationConcurrency: 1, ClaimBatchSize: 1,
				},
				queue,
				nil,
				vault,
				slog.New(slog.NewTextHandler(io.Discard, nil)),
			)
		}()
		<-queue.started
		started := time.Now()
		cancel()
		if err := <-result; err != nil {
			t.Fatal(err)
		}
		if elapsed := time.Since(started); elapsed != 2*time.Second {
			t.Errorf("active work drained for %s; want the two-second shutdown budget", elapsed)
		}
		if !queue.released {
			t.Error("worker did not release leases after canceling active work")
		}
	})
}
