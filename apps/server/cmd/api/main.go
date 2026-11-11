package main

import (
	"log/slog"
	"os"

	"cascadehook/internal/config"
	"cascadehook/internal/httpapi"
	"cascadehook/internal/process"
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
	process.StartLogging("api", os.Stdout)
	cfg, err := config.LoadAPI()
	if err != nil {
		return err
	}
	logger := process.Logger("api", os.Stdout, cfg.LogLevel)

	ctx, stop := process.SignalContext()
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
