package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"cascadehook/internal/config"
	"cascadehook/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("migrate failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	// Configuration failures also use structured logging.
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", "migrate"))
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: cfg.LogLevel,
	})).With("service", "migrate")
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	return store.Migrate(ctx, cfg.DatabaseURL, logger)
}
