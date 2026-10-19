package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cascadehook/internal/config"
	"cascadehook/internal/store"
	"cascadehook/internal/worker"
)

// The delivery queue does not exist yet; each tick pings PostgreSQL until
// claiming lands.
const pollInterval = 5 * time.Second

func main() {
	if err := run(); err != nil {
		slog.Error("worker failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	// Configuration failures also use structured logging.
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", "worker"))
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: cfg.LogLevel,
	})).With("service", "worker")
	slog.SetDefault(logger)

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

	return worker.Run(ctx, pollInterval, db, logger)
}
