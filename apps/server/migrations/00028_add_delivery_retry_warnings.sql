-- +goose Up
-- Each endpoint owns at most one retry incident. Removing a bounded batch of
-- endpoints can therefore cascade at most one extra state row per endpoint.
CREATE TABLE notification_delivery_retry_state (
    endpoint_id uuid PRIMARY KEY,
    project_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    notification_id uuid NOT NULL,
    first_failure_at timestamptz NOT NULL,
    last_failure_at timestamptz NOT NULL,
    warned_at timestamptz,
    recovered_at timestamptz,
    CHECK (first_failure_at <= last_failure_at),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id) ON DELETE CASCADE,
    FOREIGN KEY (project_id, endpoint_id) REFERENCES endpoints(project_id, id) ON DELETE CASCADE
);
CREATE INDEX notification_delivery_retry_due_idx ON notification_delivery_retry_state(first_failure_at, endpoint_id)
    WHERE warned_at IS NULL AND recovered_at IS NULL;
CREATE INDEX notification_delivery_retry_project_idx ON notification_delivery_retry_state(project_id, endpoint_id);

-- Seed pending retries so an existing long backoff does not postpone the first
-- warning until another request fails. Ignore failures superseded by a request
-- that started later and succeeded. New incidents generate their UUIDs in Go.
INSERT INTO notification_delivery_retry_state
    (endpoint_id,project_id,organization_id,notification_id,first_failure_at,last_failure_at)
SELECT d.endpoint_id,d.project_id,p.organization_id,gen_random_uuid(),min(a.finished_at),max(a.finished_at)
FROM deliveries d
JOIN delivery_attempts a ON a.delivery_id=d.id AND a.project_id=d.project_id AND a.cycle=d.cycle
JOIN endpoints e ON e.id=d.endpoint_id AND e.project_id=d.project_id
JOIN projects p ON p.id=d.project_id
JOIN organizations o ON o.id=p.organization_id
WHERE d.state IN ('pending','leased') AND d.retry_deadline>clock_timestamp()
    AND a.outcome='retryable' AND a.delivery_state='pending'
    AND e.enabled AND e.verified_at IS NOT NULL AND e.deleted_at IS NULL
    AND p.deletion_requested_at IS NULL AND o.deletion_requested_at IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM delivery_attempts succeeded
        JOIN deliveries completed ON completed.id=succeeded.delivery_id AND completed.project_id=succeeded.project_id
        WHERE completed.endpoint_id=d.endpoint_id AND completed.project_id=d.project_id
            AND succeeded.outcome='succeeded' AND succeeded.started_at>a.finished_at
    )
GROUP BY d.endpoint_id,d.project_id,p.organization_id;

-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM notification_delivery_retry_state) THEN
        RAISE EXCEPTION 'Delivery retry incidents exist; rollback requires explicit cleanup';
    END IF;
END $$;
-- +goose StatementEnd
DROP TABLE notification_delivery_retry_state;
