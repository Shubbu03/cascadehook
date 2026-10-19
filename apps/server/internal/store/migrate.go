package store

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"

	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" driver for database/sql
	"github.com/pressly/goose/v3"

	"cascadehook/migrations"
)

// Migrate applies every pending SQL migration from the embedded migrations
// package. goose runs each migration in its own transaction and records
// applied versions in goose_db_version.
func Migrate(ctx context.Context, databaseURL string, logger *slog.Logger) error {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()
	pingCtx, cancel := context.WithTimeout(ctx, connectTimeout)
	err = db.PingContext(pingCtx)
	cancel()
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}

	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("set migration dialect: %w", err)
	}
	goose.SetLogger(gooseLogger{logger: logger})
	if err := goose.UpContext(ctx, db, "."); err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}
	return nil
}

// gooseLogger routes goose output through slog so migration runs keep the
// same JSON log shape as the other binaries.
type gooseLogger struct {
	logger *slog.Logger
}

func (l gooseLogger) Printf(format string, v ...any) {
	l.logger.Info(fmt.Sprintf(format, v...))
}

func (l gooseLogger) Fatalf(format string, v ...any) {
	l.logger.Error(fmt.Sprintf(format, v...))
}
