package telemetry

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Run binds metrics before starting the service. A listener failure stops the
// service, and the metrics endpoint remains available while service work drains.
func Run(
	ctx context.Context,
	cfg Config,
	metrics *Metrics,
	logger *slog.Logger,
	service func(context.Context) error,
) error {
	if err := cfg.Validate(); err != nil {
		return err
	}
	if !cfg.Enabled() {
		return service(ctx)
	}
	listener, err := (&net.ListenConfig{}).Listen(ctx, "tcp", cfg.Address)
	if err != nil {
		return fmt.Errorf("listen for metrics: %w", err)
	}
	server := &http.Server{
		Handler:           metrics.handler(cfg.Token),
		ReadHeaderTimeout: 3 * time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       30 * time.Second,
		MaxHeaderBytes:    8 << 10,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}
	serveErr := make(chan error, 1)
	go func() { serveErr <- server.Serve(listener) }()
	logger.Info("metrics listening", "address", listener.Addr().String())

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	sampleDone := make(chan struct{})
	go func() {
		defer close(sampleDone)
		if metrics.queue != nil {
			metrics.queue.run(runCtx, logger)
		}
	}()
	serviceErr := make(chan error, 1)
	go func() { serviceErr <- service(runCtx) }()
	var runErr, listenerErr error
	listenerStopped := false
	select {
	case runErr = <-serviceErr:
	case err = <-serveErr:
		listenerStopped = true
		listenerErr = fmt.Errorf("metrics listener stopped unexpectedly: %w", err)
		cancel()
		runErr = <-serviceErr
	}
	cancel()
	<-sampleDone
	shutdownCtx, stop := context.WithTimeout(context.Background(), 5*time.Second)
	defer stop()
	shutdownErr := server.Shutdown(shutdownCtx)
	if shutdownErr != nil {
		_ = server.Close()
	}
	if !listenerStopped {
		if err := <-serveErr; !errors.Is(err, http.ErrServerClosed) {
			listenerErr = fmt.Errorf("serve metrics: %w", err)
		}
	}
	return errors.Join(runErr, listenerErr, shutdownErr)
}

func (m *Metrics) handler(token string) http.Handler {
	expected := sha256.Sum256([]byte(token))
	exposition := promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{
		MaxRequestsInFlight: 2,
		Timeout:             5 * time.Second,
		Registry:            m.registerer,
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		headers := r.Header.Values("Authorization")
		if len(headers) != 1 || !validToken(headers[0], expected) {
			w.Header().Set("WWW-Authenticate", "Bearer")
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if r.URL.Path != "/metrics" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		exposition.ServeHTTP(w, r)
	})
}

func validToken(header string, expected [sha256.Size]byte) bool {
	parts := strings.Fields(header)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return false
	}
	actual := sha256.Sum256([]byte(parts[1]))
	return subtle.ConstantTimeCompare(actual[:], expected[:]) == 1
}
