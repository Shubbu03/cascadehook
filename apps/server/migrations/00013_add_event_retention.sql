-- +goose Up
-- Retired groups are hidden before their children are removed in bounded
-- batches. This avoids unbounded cascades and prevents replay during cleanup.
ALTER TABLE events ADD COLUMN purge_started_at timestamptz;

CREATE INDEX events_retention_candidates_idx ON events (created_at, id) WHERE purge_started_at IS NULL;
CREATE INDEX events_retention_purge_idx ON events (purge_started_at, id) WHERE purge_started_at IS NOT NULL;
CREATE INDEX deliveries_event_retention_active_idx ON deliveries (event_id) WHERE state IN ('pending', 'leased');
CREATE INDEX deliveries_event_retention_activity_idx ON deliveries (event_id, updated_at DESC);

-- +goose Down
-- Partially removed histories must never become visible again.
LOCK TABLE events IN ACCESS EXCLUSIVE MODE;
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM events WHERE purge_started_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Finish retired event cleanup before rolling back retention support';
    END IF;
END;
$$;
-- +goose StatementEnd
DROP INDEX deliveries_event_retention_activity_idx;
DROP INDEX deliveries_event_retention_active_idx;
DROP INDEX events_retention_purge_idx;
DROP INDEX events_retention_candidates_idx;
ALTER TABLE events DROP COLUMN purge_started_at;
