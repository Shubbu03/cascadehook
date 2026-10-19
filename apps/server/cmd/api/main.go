package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"cascadehook/internal/config"
	"cascadehook/internal/httpapi"
	"cascadehook/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("API failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	// Configuration failures also use structured logging.
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", "api"))
	cfg, err := config.LoadAPI()
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: cfg.LogLevel,
	})).With("service", "api")
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		// A second signal can terminate immediately while the first drains requests.
		stop()
	}()

	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	return httpapi.Run(ctx, cfg, db, logger)
}
