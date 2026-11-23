package main

import (
	"log/slog"
	"os"

	"cascadehook/internal/config"
	"cascadehook/internal/process"
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
	process.StartLogging("migrate", os.Stdout)
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logger := process.Logger("migrate", os.Stdout, cfg.LogLevel)

	ctx, stop := process.SignalContext()
	defer stop()

	return store.Migrate(ctx, cfg.DatabaseURL, logger)
}
