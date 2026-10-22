package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"cascadehook/internal/config"
	"cascadehook/internal/delivery"
	"cascadehook/internal/signing"
	"cascadehook/internal/store"
	"cascadehook/internal/worker"
)

func main() {
	if err := run(); err != nil {
		slog.Error("worker failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	// Configuration failures also use structured logging.
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", "worker"))
	cfg, err := config.LoadWorker()
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: cfg.LogLevel,
	})).With("service", "worker")
	slog.SetDefault(logger)
	vault, err := signing.NewVault(cfg.SigningEncryptionKey)
	if err != nil {
		return err
	}
	outbound, err := delivery.NewClient(cfg.Concurrency, cfg.DestinationConcurrency)
	if err != nil {
		return err
	}
	defer outbound.CloseIdleConnections()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		// A second signal can terminate immediately while the first stops the loop.
		stop()
	}()

	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	return worker.Run(ctx, worker.Options{
		PollInterval:           cfg.PollInterval,
		ShutdownTimeout:        cfg.ShutdownTimeout,
		Concurrency:            cfg.Concurrency,
		DestinationConcurrency: cfg.DestinationConcurrency,
		ClaimBatchSize:         cfg.ClaimBatchSize,
	}, db, outbound, vault, logger)
}
