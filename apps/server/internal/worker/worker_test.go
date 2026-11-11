package worker

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"cascadehook/internal/deliveries"
	"cascadehook/internal/delivery"
	"cascadehook/internal/signing"
)

type fakeQueue struct {
	mu        sync.Mutex
	jobs      []deliveries.Job
	claims    int
	owner     uuid.UUID
	began     []uuid.UUID
	released  int
	recovered int
	expired   int
	claimErr  error
	onBegin   func()
}

func (q *fakeQueue) ClaimDeliveries(_ context.Context, owner uuid.UUID, limit int, _ []uuid.UUID) ([]deliveries.Job, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.claims++
	q.owner = owner
	if q.claimErr != nil {
		return nil, q.claimErr
	}
	count := min(limit, len(q.jobs))
	jobs := q.jobs[:count]
	q.jobs = q.jobs[count:]
	return jobs, nil
}

// A zero attempt ID tells the worker the reservation was released, so no HTTP
// request is made and the test needs no receiver.
func (q *fakeQueue) BeginDeliveryAttempt(_ context.Context, job deliveries.Job) (deliveries.Attempt, error) {
	q.mu.Lock()
	q.began = append(q.began, job.DeliveryID)
	onBegin := q.onBegin
	q.mu.Unlock()
	if onBegin != nil {
		onBegin()
	}
	return deliveries.Attempt{}, nil
}

func (q *fakeQueue) CompleteDelivery(context.Context, deliveries.Attempt, deliveries.Result) (deliveries.Completion, error) {
	return deliveries.Completion{}, errors.New("no attempt should complete in these tests")
}

func (q *fakeQueue) ReleaseDelivery(context.Context, deliveries.Lease, time.Duration) (deliveries.Completion, error) {
	return deliveries.Completion{}, nil
}

func (q *fakeQueue) RecoverDeliveryLeases(context.Context, int) (int64, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.recovered++
	return 0, nil
}

func (q *fakeQueue) ExpirePendingDeliveries(context.Context, int) (int64, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.expired++
	return 0, nil
}

func (q *fakeQueue) ReleaseWorkerLeases(_ context.Context, owner uuid.UUID) (int64, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if owner == q.owner {
		q.released++
	}
	return 0, nil
}

func testOptions() Options {
	return Options{
		PollInterval: 100 * time.Millisecond, ShutdownTimeout: time.Second,
		Concurrency: 2, DestinationConcurrency: 1, ClaimBatchSize: 2,
	}
}

func testDependencies(t *testing.T) (*delivery.Client, *signing.Vault, *slog.Logger) {
	t.Helper()
	outbound, err := delivery.NewClient(2, 1)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(outbound.CloseIdleConnections)
	vault, err := signing.NewVaultWithPrevious(make([]byte, signing.SecretSize), nil)
	if err != nil {
		t.Fatal(err)
	}
	return outbound, vault, slog.New(slog.NewTextHandler(io.Discard, nil))
}

func signedJob(t *testing.T, vault *signing.Vault, endpoint uuid.UUID) deliveries.Job {
	t.Helper()
	secret, err := signing.NewSecret()
	if err != nil {
		t.Fatal(err)
	}
	project := uuid.New()
	return deliveries.Job{
		Lease:     deliveries.Lease{DeliveryID: uuid.New(), Token: uuid.New()},
		ProjectID: project, EndpointID: endpoint, EventID: uuid.New(),
		SigningSecret: vault.Encrypt(project, endpoint, secret),
	}
}

func TestRunRejectsInvalidOptions(t *testing.T) {
	outbound, vault, logger := testDependencies(t)
	mutations := map[string]func(*Options){
		"poll too fast":                 func(o *Options) { o.PollInterval = time.Millisecond },
		"poll too slow":                 func(o *Options) { o.PollInterval = 2 * time.Minute },
		"no shutdown timeout":           func(o *Options) { o.ShutdownTimeout = 0 },
		"zero concurrency":              func(o *Options) { o.Concurrency = 0 },
		"concurrency above limit":       func(o *Options) { o.Concurrency = deliveries.MaxConcurrency + 1 },
		"destination above concurrency": func(o *Options) { o.DestinationConcurrency = o.Concurrency + 1 },
		"zero destination concurrency":  func(o *Options) { o.DestinationConcurrency = 0 },
		"zero batch":                    func(o *Options) { o.ClaimBatchSize = 0 },
		"batch above limit":             func(o *Options) { o.ClaimBatchSize = deliveries.MaxClaimBatch + 1 },
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			options := testOptions()
			mutate(&options)
			queue := &fakeQueue{}
			if err := Run(t.Context(), options, queue, outbound, vault, logger); err == nil {
				t.Fatal("invalid options were accepted")
			}
			if queue.claims != 0 {
				t.Fatal("work was claimed with invalid options")
			}
		})
	}
}

func TestRunProcessesClaimedJobsAndReleasesLeasesOnShutdown(t *testing.T) {
	outbound, vault, logger := testDependencies(t)
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	queue := &fakeQueue{}
	queue.jobs = []deliveries.Job{signedJob(t, vault, uuid.New()), signedJob(t, vault, uuid.New()), signedJob(t, vault, uuid.New())}
	want := len(queue.jobs)
	queue.onBegin = func() {
		queue.mu.Lock()
		done := len(queue.began) == want
		queue.mu.Unlock()
		if done {
			cancel()
		}
	}
	if err := Run(ctx, testOptions(), queue, outbound, vault, logger); err != nil {
		t.Fatal(err)
	}
	if len(queue.began) != want {
		t.Fatalf("began %d attempts, want %d", len(queue.began), want)
	}
	if queue.released != 1 {
		t.Fatalf("worker leases released %d times for its own ID, want 1", queue.released)
	}
	if queue.recovered == 0 || queue.expired == 0 {
		t.Fatal("startup queue maintenance did not run")
	}
}

func TestRunSurvivesClaimFailures(t *testing.T) {
	outbound, vault, logger := testDependencies(t)
	ctx, cancel := context.WithTimeout(t.Context(), 350*time.Millisecond)
	defer cancel()
	queue := &fakeQueue{claimErr: errors.New("database unavailable")}
	if err := Run(ctx, testOptions(), queue, outbound, vault, logger); err != nil {
		t.Fatal(err)
	}
	if queue.claims < 2 {
		t.Fatalf("claimed %d times; a failed claim should be retried on the next poll", queue.claims)
	}
}

func TestRunStopsOnUndecryptableSecret(t *testing.T) {
	outbound, vault, logger := testDependencies(t)
	job := signedJob(t, vault, uuid.New())
	job.SigningSecret = []byte("not a ciphertext")
	queue := &fakeQueue{jobs: []deliveries.Job{job}}
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	if err := Run(ctx, testOptions(), queue, outbound, vault, logger); err == nil {
		t.Fatal("a credential decryption failure must stop the worker")
	}
	if len(queue.began) != 0 {
		t.Fatal("an attempt began without a usable signing secret")
	}
	if queue.released != 1 {
		t.Fatal("leases were not released after the fatal error")
	}
}
