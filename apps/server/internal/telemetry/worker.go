package telemetry

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"cascadehook/internal/deliveries"
)

type Worker struct {
	inFlight          prometheus.Gauge
	claimed           prometheus.Counter
	started           *prometheus.CounterVec
	observations      *prometheus.CounterVec
	duration          *prometheus.HistogramVec
	queueWait         prometheus.Histogram
	eventAge          prometheus.Histogram
	completions       *prometheus.CounterVec
	operations        *prometheus.CounterVec
	operationDuration *prometheus.HistogramVec
	maintenance       *prometheus.CounterVec
	errors            *prometheus.CounterVec
}

func (m *Metrics) Worker(capacity int) *Worker {
	w := &Worker{
		inFlight: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "cascadehook_worker_deliveries_in_flight", Help: "Delivery jobs executing in this worker process.",
		}),
		claimed: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "cascadehook_worker_jobs_claimed_total", Help: "Acknowledged delivery reservations, including unsent jobs.",
		}),
		started: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "cascadehook_delivery_attempts_started_total",
			Help: "Acknowledged dispatch intents; retries follow the first attempt in a cycle.",
		}, []string{"kind"}),
		observations: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "cascadehook_delivery_attempt_observations_total",
			Help: "Worker-observed attempt results, independent of database finalization.",
		}, []string{"outcome", "code", "error"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "cascadehook_delivery_attempt_duration_seconds",
			Help:    "Observed outbound attempt duration, excluding intent and completion transactions.",
			Buckets: []float64{0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30},
		}, []string{"outcome"}),
		queueWait: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name:    "cascadehook_delivery_queue_wait_seconds",
			Help:    "Time from next-attempt time to acknowledged dispatch, using database timestamps.",
			Buckets: []float64{0.1, 0.5, 1, 5, 15, 60, 300, 1800, 7200, 21600, 86400, 259200},
		}),
		eventAge: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name:    "cascadehook_delivery_event_age_at_attempt_seconds",
			Help:    "Age of the original event at acknowledged dispatch, including replay cycles.",
			Buckets: []float64{1, 5, 15, 60, 300, 1800, 7200, 21600, 86400, 259200, 604800, 2592000},
		}),
		completions: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "cascadehook_delivery_completion_observations_total",
			Help: "Acknowledged completion results, including outcomes already recorded by recovery.",
		}, []string{"state", "reason"}),
		operations: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "cascadehook_worker_queue_operations_total",
			Help: "Worker persistence calls, including completion retries and expected fencing results.",
		}, []string{"operation", "result"}),
		operationDuration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name: "cascadehook_worker_queue_operation_duration_seconds", Help: "Duration of worker persistence calls.",
			Buckets: []float64{0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5},
		}, []string{"operation"}),
		maintenance: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "cascadehook_worker_maintenance_deliveries_total",
			Help: "Acknowledged rows handled by lease recovery, pending expiry, or shutdown release.",
		}, []string{"operation"}),
		errors: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "cascadehook_worker_errors_total", Help: "Worker failures that require recovery or operator attention.",
		}, []string{"stage"}),
	}
	capacityMetric := prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "cascadehook_worker_capacity", Help: "Configured concurrent delivery capacity of this worker.",
	})
	capacityMetric.Set(float64(capacity))
	m.registerer.MustRegister(
		capacityMetric,
		w.inFlight,
		w.claimed,
		w.started,
		w.observations,
		w.duration,
		w.queueWait,
		w.eventAge,
		w.completions,
		w.operations,
		w.operationDuration,
		w.maintenance,
		w.errors,
	)
	w.started.WithLabelValues("initial")
	w.started.WithLabelValues("retry")
	for _, stage := range []string{"credential_decryption", "outcome_unpersisted"} {
		w.errors.WithLabelValues(stage)
	}
	return w
}

// A nil observer keeps instrumentation optional for callers without a registry.
func (w *Worker) JobStarted() {
	if w != nil {
		w.inFlight.Inc()
	}
}

func (w *Worker) JobFinished() {
	if w != nil {
		w.inFlight.Dec()
	}
}

func (w *Worker) Claimed(count int) {
	if w != nil {
		w.claimed.Add(float64(count))
	}
}

func (w *Worker) Operation(operation string, started time.Time, err error) {
	if w == nil {
		return
	}
	result := "ok"
	switch {
	case errors.Is(err, deliveries.ErrLeaseLost):
		result = "lease_lost"
	case errors.Is(err, deliveries.ErrAttemptStarted):
		result = "attempt_started"
	case errors.Is(err, context.Canceled):
		result = "canceled"
	case err != nil:
		result = "error"
	}
	w.operations.WithLabelValues(operation, result).Inc()
	w.operationDuration.WithLabelValues(operation).Observe(time.Since(started).Seconds())
}

func (w *Worker) AttemptStarted(job deliveries.Job, attempt deliveries.Attempt) {
	if w == nil {
		return
	}
	kind := "initial"
	if attempt.Number > 1 {
		kind = "retry"
	}
	w.started.WithLabelValues(kind).Inc()
	w.queueWait.Observe(max(attempt.StartedAt.Sub(job.NextAttemptAt).Seconds(), 0))
	w.eventAge.Observe(max(attempt.StartedAt.Sub(job.EventCreatedAt).Seconds(), 0))
}

func (w *Worker) AttemptObserved(result deliveries.Result) {
	if w == nil {
		return
	}
	code := "none"
	if result.StatusCode >= 100 && result.StatusCode <= 599 {
		code = strconv.Itoa(result.StatusCode)
	} else if result.StatusCode != 0 {
		code = "other"
	}
	errorCode := result.ErrorCode
	if errorCode == "" {
		errorCode = "none"
	}
	w.observations.WithLabelValues(string(result.Outcome), code, errorCode).Inc()
	w.duration.WithLabelValues(string(result.Outcome)).Observe(result.Duration.Seconds())
}

func (w *Worker) CompletionObserved(completion deliveries.Completion) {
	if w == nil {
		return
	}
	reason := completion.TerminalReason
	if reason == "" {
		reason = "none"
	}
	w.completions.WithLabelValues(string(completion.State), reason).Inc()
}

func (w *Worker) Maintenance(operation string, count int64) {
	if w != nil {
		w.maintenance.WithLabelValues(operation).Add(float64(count))
	}
}

func (w *Worker) Error(stage string) {
	if w != nil {
		w.errors.WithLabelValues(stage).Inc()
	}
}
