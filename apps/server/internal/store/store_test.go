package store

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
)

func TestInvalidDatabaseURLDoesNotDiscloseCredentials(t *testing.T) {
	const credential = "credential-must-stay-private"
	urls := []string{
		"postgres://operator:" + credential + "%zz@localhost/database",
		"host=localhost password='" + credential,
		"postgres://operator:" + credential + "@localhost/database?sslmode=" + credential,
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	operations := []struct {
		name string
		run  func(context.Context, string) error
	}{
		{name: "open", run: func(ctx context.Context, address string) error {
			db, err := Open(ctx, address)
			if db != nil {
				db.Close()
			}
			return err
		}},
		{name: "migrate", run: func(ctx context.Context, address string) error {
			return Migrate(ctx, address, logger)
		}},
	}
	for _, operation := range operations {
		t.Run(operation.name, func(t *testing.T) {
			for _, address := range urls {
				err := operation.run(t.Context(), address)
				if err == nil {
					t.Fatal("expected invalid database settings to fail")
				}
				if strings.Contains(err.Error(), credential) {
					t.Fatal("database error disclosed a credential")
				}
				if !strings.Contains(err.Error(), "DATABASE_URL") {
					t.Errorf("error must identify the setting to fix: %v", err)
				}
			}
		})
	}
}
