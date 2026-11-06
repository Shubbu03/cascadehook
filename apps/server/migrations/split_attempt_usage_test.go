package migrations

import (
	"context"
	"io/fs"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Run against a disposable PostgreSQL database with CASCADEHOOK_TEST_DATABASE_URL.
// A private schema and a rolled-back transaction isolate the migration fixtures.
func TestSplitAttemptUsageRollback(t *testing.T) {
	databaseURL := os.Getenv("CASCADEHOOK_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set CASCADEHOOK_TEST_DATABASE_URL to run the PostgreSQL migration regression")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		_ = tx.Rollback(cleanupCtx)
	}()
	execSQL := func(query string) {
		t.Helper()
		if _, err := tx.Exec(ctx, query); err != nil {
			t.Fatal(err)
		}
	}
	schema := pgx.Identifier{"usage_rollback_" + uuid.NewString()}.Sanitize()
	execSQL("CREATE SCHEMA " + schema)
	execSQL("SET LOCAL search_path TO " + schema)

	const migrationName = "00024_split_attempt_usage.sql"
	entries, err := fs.ReadDir(FS, ".")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".sql") || entry.Name() >= migrationName {
			continue
		}
		contents, err := FS.ReadFile(entry.Name())
		if err != nil {
			t.Fatal(err)
		}
		up, _, found := strings.Cut(string(contents), "-- +goose Down")
		if !found {
			t.Fatalf("migration %s has no Down section", entry.Name())
		}
		execSQL(up)
	}
	execSQL(`INSERT INTO organizations (id, name) VALUES
		('00000000-0000-7000-8000-000000000001', 'Live projects'),
		('00000000-0000-7000-8000-000000000002', 'Deleted projects');
		INSERT INTO projects (id, organization_id, name) VALUES
		('00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-000000000001', 'First'),
		('00000000-0000-7000-8000-000000000102', '00000000-0000-7000-8000-000000000001', 'Second');
		INSERT INTO organization_usage_months
		(organization_id, period, events, deliveries, payload_bytes, attempts, replays, succeeded, failed) VALUES
		('00000000-0000-7000-8000-000000000001', '2026-10-01', 10, 20, 4096, 10, 3, 6, 4),
		('00000000-0000-7000-8000-000000000002', '2026-10-01', 4, 8, 1024, 7, 1, 4, 3),
		('00000000-0000-7000-8000-000000000002', '2026-09-01', 0, 0, 0, 0, 0, 0, 0);
		INSERT INTO project_usage_months (project_id, period, attempts, succeeded, failed) VALUES
		('00000000-0000-7000-8000-000000000101', '2026-10-01', 3, 2, 1),
		('00000000-0000-7000-8000-000000000102', '2026-10-01', 5, 3, 2)`)
	contents, err := FS.ReadFile(migrationName)
	if err != nil {
		t.Fatal(err)
	}
	up, down, found := strings.Cut(string(contents), "-- +goose Down")
	if !found {
		t.Fatal("attempt usage migration has no Down section")
	}
	execSQL(up)
	// A retry after the UTC month boundary has no publication or organization
	// quota row in its new month. Both projects must contribute to its total.
	execSQL(`INSERT INTO project_usage_months (project_id, period, attempts, succeeded, failed) VALUES
		('00000000-0000-7000-8000-000000000101', '2026-11-01', 2, 1, 1),
		('00000000-0000-7000-8000-000000000102', '2026-11-01', 3, 1, 2);
		UPDATE project_usage_months SET attempts = attempts + 2,
		succeeded = succeeded + 1, failed = failed + 1
		WHERE project_id = '00000000-0000-7000-8000-000000000101' AND period = '2026-10-01'`)
	execSQL(down)

	cases := []struct {
		name, organizationID, period string
		want                         [7]int64
	}{
		{
			name:           "live and retired totals preserve quota counters",
			organizationID: "00000000-0000-7000-8000-000000000001", period: "2026-10-01",
			want: [7]int64{10, 20, 4096, 12, 3, 7, 5},
		},
		{
			name:           "retry-only month is restored across projects",
			organizationID: "00000000-0000-7000-8000-000000000001", period: "2026-11-01",
			want: [7]int64{0, 0, 0, 5, 0, 2, 3},
		},
		{
			name:           "deleted project history is preserved",
			organizationID: "00000000-0000-7000-8000-000000000002", period: "2026-10-01",
			want: [7]int64{4, 8, 1024, 7, 1, 4, 3},
		},
		{
			name:           "empty month is preserved",
			organizationID: "00000000-0000-7000-8000-000000000002", period: "2026-09-01",
			want: [7]int64{},
		},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			var got [7]int64
			err := tx.QueryRow(
				ctx,
				`SELECT events, deliveries, payload_bytes, attempts, replays, succeeded, failed
				FROM organization_usage_months WHERE organization_id = $1 AND period = $2::date`,
				test.organizationID,
				test.period,
			).Scan(
				&got[0],
				&got[1],
				&got[2],
				&got[3],
				&got[4],
				&got[5],
				&got[6],
			)
			if err != nil {
				t.Fatal(err)
			}
			if got != test.want {
				t.Fatalf("usage = %v, want %v", got, test.want)
			}
		})
	}
}
