-- +goose Up
ALTER TABLE deliveries
    ADD COLUMN cycle_started_at timestamptz,
    ADD COLUMN retry_deadline timestamptz;

-- Preserve the original event-based window for existing jobs. Only an explicit
-- replay may grant a fresh window; applying this migration must not extend one.
UPDATE deliveries d SET cycle_started_at = e.created_at,
    retry_deadline = e.created_at + interval '72 hours'
    FROM events e WHERE e.project_id = d.project_id AND e.id = d.event_id;

ALTER TABLE deliveries
    ALTER COLUMN cycle_started_at SET NOT NULL,
    ALTER COLUMN cycle_started_at SET DEFAULT now(),
    ALTER COLUMN retry_deadline SET NOT NULL,
    ALTER COLUMN retry_deadline SET DEFAULT (now() + interval '72 hours'),
    ADD CONSTRAINT deliveries_retry_window_check CHECK (retry_deadline > cycle_started_at);

-- Replay receipts are append-only and deduplicate requests for an observed
-- cycle, even if the worker completes that replay before a request is retried.
CREATE TABLE delivery_replays (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL,
    delivery_id uuid NOT NULL,
    from_cycle integer NOT NULL CHECK (from_cycle >= 0),
    cycle integer NOT NULL CHECK (cycle::bigint = from_cycle::bigint + 1),
    from_state text NOT NULL CHECK (from_state IN ('succeeded', 'failed')),
    from_attempt_count integer NOT NULL CHECK (from_attempt_count >= 0),
    from_terminal_reason text CHECK (from_terminal_reason ~ '^[a-z_]{1,64}$'),
    -- Keep the actor ID as an audit snapshot even if its API key is later deleted.
    api_key_id uuid NOT NULL,
    created_at timestamptz NOT NULL,
    retry_deadline timestamptz NOT NULL CHECK (retry_deadline > created_at),
    CHECK (from_terminal_reason IS NULL OR from_state = 'failed'),
    FOREIGN KEY (project_id, delivery_id) REFERENCES deliveries(project_id, id) ON DELETE CASCADE,
    UNIQUE (delivery_id, from_cycle)
);

-- +goose Down
DROP TABLE delivery_replays;
ALTER TABLE deliveries
    DROP CONSTRAINT deliveries_retry_window_check,
    DROP COLUMN retry_deadline,
    DROP COLUMN cycle_started_at;
