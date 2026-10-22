package store

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"cascadehook/migrations"
)

// Migrate applies every pending SQL migration from the embedded migrations
// package. Goose runs each migration in its own transaction and records
// applied versions in goose_db_version.
func Migrate(ctx context.Context, databaseURL string, logger *slog.Logger) error {
	config, err := pgx.ParseConfig(databaseURL)
	if err != nil {
		// Parsing errors can contain the original DSN, including malformed credentials.
		return fmt.Errorf("invalid DATABASE_URL: check PostgreSQL connection settings")
	}
	db := stdlib.OpenDB(*config)
	defer db.Close()
	pingCtx, cancel := context.WithTimeout(ctx, connectTimeout)
	err = db.PingContext(pingCtx)
	cancel()
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}

	provider, err := goose.NewProvider(
		goose.DialectPostgres,
		db,
		migrations.FS,
		goose.WithSlog(logger),
		goose.WithDisableGlobalRegistry(true),
	)
	if err != nil {
		return fmt.Errorf("initialize migrations: %w", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}
	return nil
}
