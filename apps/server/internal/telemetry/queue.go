package telemetry

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"cascadehook/internal/deliveries"
)

type QueueSource interface {
	QueueStats(context.Context) (deliveries.QueueStats, error)
}

type queueSampler struct {
	source        QueueSource
	mu            sync.RWMutex
	snapshot      deliveries.QueueStats
	up            bool
	depth         *prometheus.Desc
	oldestDue     *prometheus.Desc
	lastSuccess   *prometheus.Desc
	sampleSuccess *prometheus.Desc
}

// Queue gauges cover the shared database, not an individual worker. Sampling
// runs outside scrapes, so scraper traffic cannot multiply database queries.
func (m *Metrics) Queue(source QueueSource) {
	m.queue = &queueSampler{
		source: source,
		depth: prometheus.NewDesc(
			"cascadehook_queue_deliveries",
			"Global active queue rows; due includes blocked or exhausted pending jobs.",
			[]string{"state"},
			nil,
		),
		oldestDue: prometheus.NewDesc(
			"cascadehook_queue_oldest_due_age_seconds",
			"Age past next-attempt time of the oldest pending job at the last successful sample.",
			nil,
			nil,
		),
		lastSuccess: prometheus.NewDesc(
			"cascadehook_queue_last_success_timestamp_seconds",
			"Database timestamp of the last successful queue sample; zero before the first success.",
			nil,
			nil,
		),
		sampleSuccess: prometheus.NewDesc(
			"cascadehook_queue_sample_success",
			"Whether the most recent background queue sample succeeded.",
			nil,
			nil,
		),
	}
	m.registerer.MustRegister(m.queue)
}

func (q *queueSampler) Describe(ch chan<- *prometheus.Desc) {
	ch <- q.depth
	ch <- q.oldestDue
	ch <- q.lastSuccess
	ch <- q.sampleSuccess
}

func (q *queueSampler) Collect(ch chan<- prometheus.Metric) {
	q.mu.RLock()
	snapshot, up := q.snapshot, q.up
	q.mu.RUnlock()
	success, timestamp := float64(0), float64(0)
	if up {
		success = 1
	}
	if !snapshot.SampledAt.IsZero() {
		timestamp = float64(snapshot.SampledAt.UnixNano()) / 1e9
		for state, count := range map[string]int64{
			"pending": snapshot.Pending, "due": snapshot.Due,
			"leased": snapshot.Leased, "expired_leases": snapshot.ExpiredLeases,
		} {
			ch <- prometheus.MustNewConstMetric(
				q.depth,
				prometheus.GaugeValue,
				float64(count),
				state,
			)
		}
		ch <- prometheus.MustNewConstMetric(q.oldestDue, prometheus.GaugeValue, snapshot.OldestDueAge.Seconds())
	}
	ch <- prometheus.MustNewConstMetric(q.lastSuccess, prometheus.GaugeValue, timestamp)
	ch <- prometheus.MustNewConstMetric(q.sampleSuccess, prometheus.GaugeValue, success)
}

func (q *queueSampler) run(ctx context.Context, logger *slog.Logger) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for ctx.Err() == nil {
		sampleCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		snapshot, err := q.source.QueueStats(sampleCtx)
		cancel()
		if ctx.Err() != nil {
			return
		}
		q.mu.Lock()
		q.up = err == nil
		if err == nil {
			q.snapshot = snapshot
		}
		q.mu.Unlock()
		if err != nil && ctx.Err() == nil {
			logger.Warn("queue metrics sample failed", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
