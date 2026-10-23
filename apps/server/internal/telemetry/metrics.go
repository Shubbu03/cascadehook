package telemetry

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Metrics struct {
	registry   *prometheus.Registry
	registerer prometheus.Registerer
	queue      *queueSampler
}

// Each executable owns a registry; the default global registry is never used.
func New(service string, poolStats func() *pgxpool.Stat) *Metrics {
	registry := prometheus.NewRegistry()
	registerer := prometheus.WrapRegistererWith(prometheus.Labels{"service": service}, registry)
	registerer.MustRegister(collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	registerPoolMetrics(registerer, poolStats)
	return &Metrics{registry: registry, registerer: registerer}
}

// HTTP includes CORS and rate-limit rejections. ServeMux supplies the bounded
// route template after dispatch; early middleware responses share one label.
func (m *Metrics) HTTP(next http.Handler, routes []string) http.Handler {
	registered := make(map[string]struct{}, len(routes))
	for _, route := range routes {
		registered[route] = struct{}{}
	}
	requests := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "cascadehook_http_requests_total",
		Help: "Completed API requests by registered route, method, and response code.",
	}, []string{"route", "method", "code"})
	duration := prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "cascadehook_http_request_duration_seconds",
		Help:    "API handler duration including authentication and database work.",
		Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30},
	}, []string{"route", "method"})
	inFlight := prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "cascadehook_http_requests_in_flight",
		Help: "API requests currently executing.",
	})
	m.registerer.MustRegister(requests, duration, inFlight)
	route := promhttp.WithLabelFromRequest("route", func(r *http.Request) string {
		switch r.Pattern {
		case "":
			return "before_routing"
		case "/":
			return "unmatched"
		default:
			// Router-generated redirects can report paths instead of templates.
			if _, ok := registered[r.Pattern]; ok {
				return r.Pattern
			}
			return "unmatched"
		}
	})
	return promhttp.InstrumentHandlerInFlight(inFlight,
		promhttp.InstrumentHandlerDuration(duration,
			promhttp.InstrumentHandlerCounter(requests, next, route), route))
}

func registerPoolMetrics(registerer prometheus.Registerer, stats func() *pgxpool.Stat) {
	gauges := []struct {
		name, help string
		value      func(*pgxpool.Stat) float64
	}{
		{
			name: "connections", help: "Open database pool connections.",
			value: func(s *pgxpool.Stat) float64 { return float64(s.TotalConns()) },
		},
		{
			name: "connections_in_use", help: "Database connections currently acquired.",
			value: func(s *pgxpool.Stat) float64 { return float64(s.AcquiredConns()) },
		},
		{
			name: "connections_idle", help: "Idle database pool connections.",
			value: func(s *pgxpool.Stat) float64 { return float64(s.IdleConns()) },
		},
		{
			name: "connections_max", help: "Configured database pool capacity.",
			value: func(s *pgxpool.Stat) float64 { return float64(s.MaxConns()) },
		},
	}
	for _, metric := range gauges {
		registerer.MustRegister(prometheus.NewGaugeFunc(prometheus.GaugeOpts{
			Name: "cascadehook_db_pool_" + metric.name, Help: metric.help,
		}, func() float64 { return metric.value(stats()) }))
	}
	counters := []struct {
		name, help string
		value      func(*pgxpool.Stat) float64
	}{
		{
			name: "acquires_total", help: "Successful database pool acquisitions.",
			value: func(s *pgxpool.Stat) float64 { return float64(s.AcquireCount()) },
		},
		{
			name: "acquire_duration_seconds_total", help: "Time spent on successful database pool acquisitions.",
			value: func(s *pgxpool.Stat) float64 { return s.AcquireDuration().Seconds() },
		},
		{
			name: "empty_acquires_total", help: "Successful acquisitions that waited for an available connection.",
			value: func(s *pgxpool.Stat) float64 { return float64(s.EmptyAcquireCount()) },
		},
		{
			name: "empty_acquire_wait_seconds_total", help: "Time waiting for successful acquisitions from an empty pool.",
			value: func(s *pgxpool.Stat) float64 { return s.EmptyAcquireWaitTime().Seconds() },
		},
		{
			name: "canceled_acquires_total", help: "Database pool acquisitions canceled by their context.",
			value: func(s *pgxpool.Stat) float64 { return float64(s.CanceledAcquireCount()) },
		},
	}
	for _, metric := range counters {
		registerer.MustRegister(prometheus.NewCounterFunc(prometheus.CounterOpts{
			Name: "cascadehook_db_pool_" + metric.name, Help: metric.help,
		}, func() float64 { return metric.value(stats()) }))
	}
}
