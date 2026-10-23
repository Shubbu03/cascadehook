-- +goose Up
ALTER TABLE deliveries
    ADD CONSTRAINT deliveries_project_id_id_key UNIQUE (project_id, id),
    ADD COLUMN active_attempt_id uuid,
    ADD COLUMN active_attempt_started_at timestamptz,
    ADD COLUMN terminal_reason text CONSTRAINT deliveries_terminal_reason_format_check CHECK (terminal_reason ~ '^[a-z_]{1,64}$'),
    ADD CONSTRAINT deliveries_active_attempt_check CHECK (
        (active_attempt_id IS NULL AND active_attempt_started_at IS NULL)
        OR (state = 'leased' AND active_attempt_id IS NOT NULL AND active_attempt_started_at IS NOT NULL AND attempt_count > 0)
    ),
    ADD CONSTRAINT deliveries_terminal_reason_state_check CHECK (terminal_reason IS NULL OR state = 'failed');

-- Completed/interrupted records are inserted once. In-flight intent is stored
-- on deliveries so crash recovery can append a result without rewriting history.
CREATE TABLE delivery_attempts (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL,
    delivery_id uuid NOT NULL,
    cycle integer NOT NULL CHECK (cycle >= 0),
    attempt_number integer NOT NULL CHECK (attempt_number > 0),
    lease_token uuid NOT NULL,
    lease_owner uuid NOT NULL,
    started_at timestamptz NOT NULL,
    finished_at timestamptz NOT NULL,
    duration_ms bigint NOT NULL CHECK (duration_ms >= 0),
    status_code integer CHECK (status_code BETWEEN 100 AND 999),
    outcome text NOT NULL CHECK (outcome IN ('succeeded', 'retryable', 'terminal', 'interrupted')),
    error_code text CHECK (error_code ~ '^[a-z_]{1,64}$'),
    response_truncated boolean NOT NULL DEFAULT false,
    response_read_error boolean NOT NULL DEFAULT false,
    delivery_state text NOT NULL CHECK (delivery_state IN ('pending', 'succeeded', 'failed', 'canceled')),
    terminal_reason text CHECK (terminal_reason ~ '^[a-z_]{1,64}$'),
    retry_at timestamptz,
    FOREIGN KEY (project_id, delivery_id) REFERENCES deliveries(project_id, id) ON DELETE CASCADE,
    UNIQUE (delivery_id, cycle, attempt_number),
    UNIQUE (delivery_id, lease_token),
    CHECK ((delivery_state = 'pending') = (retry_at IS NOT NULL)),
    CHECK (terminal_reason IS NULL OR delivery_state = 'failed')
);

CREATE INDEX delivery_attempts_delivery_history_idx ON delivery_attempts (project_id, delivery_id, cycle, attempt_number);

-- +goose Down
DROP TABLE delivery_attempts;
ALTER TABLE deliveries
    DROP CONSTRAINT deliveries_terminal_reason_state_check,
    DROP CONSTRAINT deliveries_active_attempt_check,
    DROP COLUMN terminal_reason,
    DROP COLUMN active_attempt_started_at,
    DROP COLUMN active_attempt_id,
    DROP CONSTRAINT deliveries_project_id_id_key;
