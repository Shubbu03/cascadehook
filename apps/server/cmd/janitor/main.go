package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cascadehook/internal/config"
	"cascadehook/internal/retention"
	"cascadehook/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("janitor failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	// stdout is a machine-readable report; operational logs go to stderr.
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, nil)).With("service", "janitor"))
	flags := flag.NewFlagSet("janitor", flag.ContinueOnError)
	dryRun := flags.Bool("dry-run", false,
		"preview current per-phase candidate counts, capped by batch size, without changing data")
	if err := flags.Parse(os.Args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("janitor does not accept positional arguments")
	}
	cfg, err := config.LoadJanitor()
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.LogLevel})).
		With("service", "janitor")
	slog.SetDefault(logger)
	signalCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	// Include startup connectivity in the one-shot job's overall budget.
	ctx, cancel := context.WithTimeout(signalCtx, cfg.Retention.RunTimeout)
	defer cancel()
	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	started := time.Now()
	report, cleanupErr := retention.Run(
		ctx,
		db,
		retention.Options{Config: cfg.Retention, DryRun: *dryRun},
		logger,
	)
	logger.Info(
		"janitor run finished",
		"status",
		report.Status,
		"dry_run",
		report.DryRun,
		"batches",
		report.Batches,
		"phase_rows",
		report.Rows,
		"cutoff",
		report.Cutoff,
		"duration_ms",
		time.Since(started).Milliseconds(),
	)
	if err := json.NewEncoder(os.Stdout).Encode(report); err != nil {
		return errors.Join(cleanupErr, fmt.Errorf("write retention report; committed cleanup progress is retained: %w", err))
	}
	return cleanupErr
}
