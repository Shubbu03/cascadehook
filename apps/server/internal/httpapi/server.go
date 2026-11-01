package httpapi

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"cascadehook/internal/auth"
	"cascadehook/internal/clerk"
	"cascadehook/internal/config"
	"cascadehook/internal/deliveries"
	"cascadehook/internal/delivery"
	"cascadehook/internal/signing"
	"cascadehook/internal/store"
	"cascadehook/internal/telemetry"
)

func Run(ctx context.Context, cfg config.APIConfig, db *store.Store, logger *slog.Logger) error {
	sessions, err := auth.NewClerkVerifier(cfg.Clerk)
	if err != nil {
		return err
	}
	identityWebhook, err := clerk.NewWebhook(cfg.ClerkWebhookSecrets)
	if err != nil {
		return err
	}
	clerkBackend, err := clerk.New(cfg.ClerkBackend)
	if err != nil {
		return err
	}
	if clerkBackend != nil {
		defer clerkBackend.CloseIdleConnections()
	}
	vault, err := signing.NewVaultWithPrevious(cfg.SigningEncryptionKey, cfg.PreviousEncryptionKey)
	if err != nil {
		return err
	}
	outbound, err := delivery.NewClient(deliveries.DefaultConcurrency, deliveries.DefaultDestinationConcurrency)
	if err != nil {
		return err
	}
	defer outbound.CloseIdleConnections()
	var metrics *telemetry.Metrics
	if cfg.Metrics.Enabled() {
		metrics = telemetry.New("api", db.PoolStats)
	}
	handler, err := NewHandler(HandlerOptions{
		DB: db, Logger: logger, Vault: vault, Outbound: outbound, Sessions: sessions,
		RequestLimits: cfg.RequestLimits, Metrics: metrics,
		IdentityWebhook: identityWebhook, ClerkIssuer: cfg.Clerk.IssuerURL, ClerkBackend: clerkBackend,
		Email: cfg.Email,
	})
	if err != nil {
		return err
	}
	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    64 << 10,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}
	return telemetry.Run(
		ctx,
		cfg.Metrics,
		metrics,
		logger,
		func(serviceCtx context.Context) error {
			listener, err := (&net.ListenConfig{}).Listen(serviceCtx, "tcp", cfg.HTTPAddr)
			if err != nil {
				return fmt.Errorf("listen on %s: %w", cfg.HTTPAddr, err)
			}
			return serve(
				serviceCtx,
				server,
				listener,
				cfg.ShutdownTimeout,
				logger,
			)
		},
	)
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
