package httpapi

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"cascadehook/internal/config"
	"cascadehook/internal/deliveries"
	"cascadehook/internal/delivery"
	"cascadehook/internal/signing"
	"cascadehook/internal/store"
)

func Run(ctx context.Context, cfg config.APIConfig, db *store.Store, logger *slog.Logger) error {
	vault, err := signing.NewVault(cfg.SigningEncryptionKey)
	if err != nil {
		return err
	}
	outbound, err := delivery.NewClient(deliveries.DefaultConcurrency, deliveries.DefaultDestinationConcurrency)
	if err != nil {
		return err
	}
	defer outbound.CloseIdleConnections()
	listener, err := (&net.ListenConfig{}).Listen(ctx, "tcp", cfg.HTTPAddr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", cfg.HTTPAddr, err)
	}
	server := &http.Server{
		Handler:           NewHandler(db, logger, vault, outbound),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    64 << 10,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}
	return serve(ctx, server, listener, cfg.ShutdownTimeout, logger)
}

func serve(ctx context.Context, server *http.Server, listener net.Listener, timeout time.Duration, logger *slog.Logger) error {
	serveErr := make(chan error, 1)
	go func() {
		serveErr <- server.Serve(listener)
	}()
	logger.Info("API listening", "address", listener.Addr().String())

	select {
	case err := <-serveErr:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return fmt.Errorf("serve HTTP: %w", err)
	case <-ctx.Done():
	}

	logger.Info("API shutting down", "timeout", timeout.String())
	// Shutdown needs a fresh context so the signal doesn't cancel request draining.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		// Shutdown leaves active connections open when its deadline expires.
		_ = server.Close()
		<-serveErr
		return fmt.Errorf("shut down HTTP server: %w", err)
	}
	if err := <-serveErr; !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve HTTP: %w", err)
	}
	logger.Info("API stopped")
	return nil
}
