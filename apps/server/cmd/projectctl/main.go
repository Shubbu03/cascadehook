// projectctl runs only with operator database access, never customer credentials.
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
	"cascadehook/internal/controls"
	"cascadehook/internal/store"
)

type command struct {
	action string
	change controls.ProjectChange
	limit  int
}

func main() {
	if err := run(); err != nil {
		slog.Error("project control command failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, nil)).With("service", "projectctl"))
	cmd, err := parseCommand(os.Args[1:])
	if errors.Is(err, flag.ErrHelp) {
		return nil
	}
	if err != nil {
		return err
	}
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.LogLevel})).
		With("service", "projectctl")
	slog.SetDefault(logger)
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
	switch cmd.action {
	case "status":
		output, err = db.GetProjectState(ctx, cmd.change.ProjectID)
	case "history":
		actions, readErr := db.ListProjectControlActions(ctx, cmd.change.ProjectID, cmd.limit)
		err = readErr
		if actions == nil {
			actions = make([]controls.ProjectAction, 0)
		}
		output = struct {
			Data []controls.ProjectAction `json:"data"`
		}{Data: actions}
	case "suspend", "resume":
		var result store.ProjectControlResult
		result, err = db.ChangeProjectControl(ctx, cmd.change)
		if err == nil {
			logger.Info(
				"project control change confirmed",
				"project_id",
				result.State.ProjectID,
				"suspended",
				result.State.Suspended,
				"version",
				result.State.Version,
				"changed",
				result.Changed,
			)
		}
		output = result
	}
	if err != nil {
		return err
	}
	if err := json.NewEncoder(os.Stdout).Encode(output); err != nil {
		return fmt.Errorf("write command output; a change may have committed, so read status before retrying: %w", err)
	}
	return nil
}

func parseCommand(args []string) (command, error) {
	if len(args) == 0 {
		return command{}, fmt.Errorf("usage: projectctl <status|history|suspend|resume> --project UUID [options]")
	}
	if args[0] == "--help" || args[0] == "-h" {
		_, _ = fmt.Fprintln(os.Stderr, "usage: projectctl <status|history|suspend|resume> --project UUID [options]")
		return command{}, flag.ErrHelp
	}
	action := args[0]
	switch action {
	case "status", "history", "suspend", "resume":
	default:
		return command{}, fmt.Errorf("action must be status, history, suspend, or resume")
	}
	flags := flag.NewFlagSet("projectctl "+action, flag.ContinueOnError)
	project := flags.String("project", "", "project UUID (required)")
	reason := flags.String("reason", "",
		"lowercase reason code, such as abuse_report or review_complete (required for changes)")
	operator := flags.String("operator", "",
		"operator audit label, 1-64 letters/digits/dots/underscores/hyphens (required for changes)")
	version := flags.Int64("expected-version", -1, "current status version (required for changes)")
	limit := flags.Int("limit", 20, "number of recent audit actions, 1-100 (history only)")
	if err := flags.Parse(args[1:]); err != nil {
		return command{}, err
	}
	if flags.NArg() != 0 {
		return command{}, fmt.Errorf("unexpected positional arguments")
	}
	id, err := uuid.Parse(*project)
	if err != nil || id == uuid.Nil {
		return command{}, fmt.Errorf("--project must be a nonzero UUID")
	}
	cmd := command{action: action, limit: *limit, change: controls.ProjectChange{
		ProjectID: id, Suspended: action == "suspend", ExpectedVersion: *version,
		Reason: *reason, OperatorLabel: *operator,
	}}
	mutating := action == "suspend" || action == "resume"
	var invalidOption bool
	flags.Visit(func(option *flag.Flag) {
		switch option.Name {
		case "reason", "operator", "expected-version":
			invalidOption = invalidOption || !mutating
		case "limit":
			invalidOption = invalidOption || action != "history"
		}
	})
	if invalidOption {
		return command{}, fmt.Errorf("reason/operator/expected-version apply only to changes; limit applies only to history")
	}
	if mutating {
		if err := cmd.change.Validate(); err != nil {
			return command{}, err
		}
	}
	if action == "history" && (cmd.limit < 1 || cmd.limit > 100) {
		return command{}, fmt.Errorf("--limit must be between 1 and 100")
	}
	return cmd, nil
}
