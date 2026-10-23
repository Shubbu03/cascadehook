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

	"github.com/google/uuid"

	"cascadehook/internal/config"
	"cascadehook/internal/signing"
	"cascadehook/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("secret rotation failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, nil)).With("service", "secretctl"))
	flags := flag.NewFlagSet("secretctl", flag.ContinueOnError)
	preview := flags.Bool("dry-run", false, "inspect ciphertext without changes")
	limit := flags.Int("batch-size", 100, "endpoints per batch, 1-1000")
	maxBatches := flags.Int("max-batches", 100, "maximum batches, 1-1000")
	after := flags.String("after", uuid.Nil.String(), "resume after endpoint UUID from previous report")
	if err := flags.Parse(os.Args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if flags.NArg() != 0 || *maxBatches < 1 || *maxBatches > 1000 || *limit < 1 || *limit > 1000 {
		return fmt.Errorf("unexpected arguments or batch limits outside 1-1000")
	}
	cursor, err := uuid.Parse(*after)
	if err != nil {
		return fmt.Errorf("--after must be an endpoint UUID")
	}
	cfg, err := config.LoadWorker()
	if err != nil {
		return err
	}
	if len(cfg.PreviousEncryptionKey) == 0 {
		return fmt.Errorf("SIGNING_ENCRYPTION_PREVIOUS_KEY is required for rotation")
	}
	vault, err := signing.NewVaultWithPrevious(cfg.SigningEncryptionKey, cfg.PreviousEncryptionKey)
	if err != nil {
		return err
	}
	signalCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(signalCtx, 5*time.Minute)
	defer cancel()
	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	for range *maxBatches {
		batchCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		options := store.RewrapOptions{After: cursor, Limit: *limit, DryRun: *preview}
		result, err := db.RewrapSigningSecrets(batchCtx, vault, options)
		cancel()
		if outputErr := json.NewEncoder(os.Stdout).Encode(result); outputErr != nil {
			return fmt.Errorf("write rotation report; rerun from last acknowledged cursor: %w", outputErr)
		}
		if err != nil {
			return err
		}
		if result.Done {
			return nil
		}
		cursor = result.After
	}
	return nil
}
