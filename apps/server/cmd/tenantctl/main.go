// tenantctl requires operator-controlled database access; it has no HTTP route.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"

	"cascadehook/internal/accounts"
	"cascadehook/internal/config"
	"cascadehook/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("tenant command failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, nil)).With("service", "tenantctl"))
	if len(os.Args) < 2 {
		return fmt.Errorf("usage: tenantctl <status|recover-owner|set-limits> --organization UUID [options]")
	}
	action := os.Args[1]
	if action == "--help" || action == "-h" {
		_, err := fmt.Fprintln(os.Stderr, "usage: tenantctl <status|recover-owner|set-limits> --organization UUID [options]")
		return err
	}
	if action != "status" && action != "recover-owner" && action != "set-limits" {
		return fmt.Errorf("action must be status, recover-owner, or set-limits")
	}
	flags := flag.NewFlagSet("tenantctl "+action, flag.ContinueOnError)
	organization := flags.String("organization", "", "organization UUID")
	user := flags.String("user", "", "signed-in local user UUID; recover-owner only")
	operator := flags.String("operator", "", "operator audit label required for changes")
	limitsJSON := flags.String("limits-json", "", "complete limits JSON from status; set-limits only")
	version := flags.Int64("expected-version", -1, "current quota_version from status; set-limits only")
	if err := flags.Parse(os.Args[2:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("unexpected positional arguments")
	}
	invalidOption := false
	flags.Visit(func(option *flag.Flag) {
		switch option.Name {
		case "user":
			invalidOption = invalidOption || action != "recover-owner"
		case "operator":
			invalidOption = invalidOption || action == "status"
		case "limits-json", "expected-version":
			invalidOption = invalidOption || action != "set-limits"
		}
	})
	if invalidOption {
		return fmt.Errorf("user applies to recovery; limits-json/expected-version to quota updates; operator to changes")
	}
	id, err := uuid.Parse(*organization)
	if err != nil || id == uuid.Nil {
		return fmt.Errorf("--organization must be a nonzero UUID")
	}
	if action != "status" && *operator == "" {
		return fmt.Errorf("--operator is required for changes")
	}
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	signalCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(signalCtx, 30*time.Second)
	defer cancel()
	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	var output any
	switch action {
	case "status":
		output, err = db.OperatorTenantStatus(ctx, id)
	case "recover-owner":
		userID, parseErr := uuid.Parse(*user)
		if parseErr != nil || userID == uuid.Nil {
			return fmt.Errorf("--user must be a nonzero local account UUID")
		}
		output, err = db.RecoverOrganizationOwner(
			ctx,
			id,
			userID,
			*operator,
		)
	case "set-limits":
		var limits accounts.Quotas
		decoder := json.NewDecoder(strings.NewReader(*limitsJSON))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&limits); err != nil {
			return fmt.Errorf("invalid --limits-json")
		}
		var extra any
		if !errors.Is(decoder.Decode(&extra), io.EOF) {
			return fmt.Errorf("--limits-json must contain one JSON object")
		}
		err = db.SetOrganizationQuotas(ctx, accounts.QuotaChange{
			OrganizationID: id, Limits: limits, ExpectedVersion: *version, Operator: *operator,
		})
		if err == nil {
			output, err = db.OperatorTenantStatus(ctx, id)
		}
	}
	if err != nil {
		return err
	}
	if action != "status" {
		slog.Info(
			"tenant change confirmed",
			"action",
			action,
			"organization_id",
			id,
			"operator",
			*operator,
		)
	}
	if err := json.NewEncoder(os.Stdout).Encode(output); err != nil {
		return fmt.Errorf("write output; inspect tenant status before retrying a change: %w", err)
	}
	return nil
}
