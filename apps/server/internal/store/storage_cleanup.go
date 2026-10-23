package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

func deleteEventsWithStorage(ctx context.Context, tx pgx.Tx, selection retentionSelection) (int64, error) {
	// Candidate fragments are fixed local SQL. Each erased event releases its
	// exact payload bytes in the same commit; historical usage is retained.
	query := `WITH candidates AS (` + selection.query + ` FOR UPDATE OF e SKIP LOCKED),
		deleted AS (DELETE FROM events t USING candidates c WHERE t.id = c.id
			RETURNING t.project_id, octet_length(t.payload)::bigint AS bytes),
		totals AS (SELECT project_id, sum(bytes)::bigint AS bytes FROM deleted GROUP BY project_id),
		debited AS (UPDATE project_storage s SET payload_bytes = s.payload_bytes - totals.bytes
			FROM totals WHERE s.project_id = totals.project_id RETURNING s.project_id)
		SELECT count(*) FROM deleted`
	var count int64
	if err := tx.QueryRow(ctx, query, selection.args...).Scan(&count); err != nil {
		return 0, fmt.Errorf("erase event payloads and release storage: %w", err)
	}
	return count, nil
}
