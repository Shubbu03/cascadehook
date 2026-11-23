// Package process holds the process setup shared by every binary in cmd.
package process

import (
	"context"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
)

// StartLogging installs a structured default logger before configuration is
// loaded, so configuration failures are reported in the same format.
func StartLogging(service string, out io.Writer) {
	slog.SetDefault(slog.New(slog.NewJSONHandler(out, nil)).With("service", service))
}

// Logger replaces the default logger with one at the configured level.
func Logger(service string, out io.Writer, level slog.Leveler) *slog.Logger {
	logger := slog.New(slog.NewJSONHandler(out, &slog.HandlerOptions{Level: level})).With("service", service)
	slog.SetDefault(logger)
	return logger
}

// SignalContext is canceled by SIGINT or SIGTERM.
func SignalContext() (context.Context, context.CancelFunc) {
	return signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
}
