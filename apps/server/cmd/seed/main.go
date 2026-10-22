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
	"strings"
	"syscall"
	"time"
	"unicode/utf8"

	"cascadehook/internal/auth"
	"cascadehook/internal/config"
	"cascadehook/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("seed failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	// Keep operational logs on stderr; stdout is reserved for the credential.
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, nil)).With("service", "seed"))
	flags := flag.NewFlagSet("seed", flag.ContinueOnError)
	organization := flags.String("organization", "Development", "name of the new development organization")
	project := flags.String("project", "Development", "name of the new development project")
	keyName := flags.String("key-name", "Development seed key", "display name of the new API key")
	if err := flags.Parse(os.Args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("seed does not accept positional arguments")
	}

	params := store.BootstrapParams{
		OrganizationName: strings.TrimSpace(*organization),
		ProjectName:      strings.TrimSpace(*project),
		KeyName:          strings.TrimSpace(*keyName),
	}
	validatedKeyName, err := auth.NormalizeKeyName(params.KeyName)
	if err != nil {
		return err
	}
	params.KeyName = validatedKeyName
	for _, field := range []struct{ name, value string }{
		{name: "organization", value: params.OrganizationName},
		{name: "project", value: params.ProjectName},
		{name: "key-name", value: params.KeyName},
	} {
		length := utf8.RuneCountInString(field.value)
		invalidLength := length < 1 || length > 100
		if !utf8.ValidString(field.value) || invalidLength {
			return fmt.Errorf("%s must contain between 1 and 100 characters after trimming whitespace", field.name)
		}
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{
		Level: cfg.LogLevel,
	})).With("service", "seed")
	slog.SetDefault(logger)

	key, err := auth.NewDevelopmentAPIKey()
	if err != nil {
		return err
	}
	params.KeyPrefix = key.Prefix
	params.KeyHash = key.Hash

	signalCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(signalCtx, 30*time.Second)
	defer cancel()
	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.BootstrapDevelopment(ctx, params)
	if err != nil {
		return err
	}

	// The transaction has committed. This is the only disclosure of the token;
	// it is deliberately absent from the normal log records and stored rows.
	// #nosec G117 -- Explicit one-time credential output is the seed command contract.
	if err := json.NewEncoder(os.Stdout).Encode(struct {
		store.BootstrapResult
		APIKeyPrefix string `json:"api_key_prefix"`
		APIKey       string `json:"api_key"`
	}{
		BootstrapResult: result,
		APIKeyPrefix:    key.Prefix,
		APIKey:          key.Token,
	}); err != nil {
		return fmt.Errorf("bootstrap committed but credential output failed; the secret cannot be recovered: %w", err)
	}
	logger.Info(
		"development bootstrap created",
		"organization_id",
		result.OrganizationID,
		"project_id",
		result.ProjectID,
		"api_key_id",
		result.APIKeyID,
	)
	return nil
}
