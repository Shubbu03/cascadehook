package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	"cascadehook/internal/accounts"
	"cascadehook/internal/auth"
	"cascadehook/internal/config"
	"cascadehook/internal/process"
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
	process.StartLogging("seed", os.Stderr)
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

	organizationName, err := accounts.NormalizeName(*organization)
	if err != nil {
		return fmt.Errorf("organization: %w", err)
	}
	projectName, err := accounts.NormalizeName(*project)
	if err != nil {
		return fmt.Errorf("project: %w", err)
	}
	validatedKeyName, err := auth.NormalizeKeyName(*keyName)
	if err != nil {
		return fmt.Errorf("key-name: %w", err)
	}
	params := store.BootstrapParams{
		OrganizationName: organizationName,
		ProjectName:      projectName,
		KeyName:          validatedKeyName,
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logger := process.Logger("seed", os.Stderr, cfg.LogLevel)

	key, err := auth.NewAPIKey(auth.EnvironmentDevelopment)
	if err != nil {
		return err
	}
	params.KeyPrefix = key.Prefix
	params.KeyHash = key.Hash

	signalCtx, stop := process.SignalContext()
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
