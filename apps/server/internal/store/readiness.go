package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"cascadehook/migrations"
)

// Ready checks connectivity and that the newest migration embedded in this
// binary is applied. A schema ahead of the binary still passes, so an older
// release keeps serving while a newer one migrates.
func (s *Store) Ready(ctx context.Context) error {
	latest, err := migrations.LatestVersion()
	if err != nil {
		return err
	}
	// The newest row wins in case a rollback left an is_applied=false record.
	var applied bool
	err = s.pool.QueryRow(ctx, `SELECT is_applied FROM goose_db_version
		WHERE version_id = $1 ORDER BY id DESC LIMIT 1`, latest).Scan(&applied)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !applied) {
		return fmt.Errorf("backend schema unavailable; apply migrations through %05d", latest)
	}
	if err != nil {
		return fmt.Errorf("check backend schema: %w", err)
	}
	return nil
}
