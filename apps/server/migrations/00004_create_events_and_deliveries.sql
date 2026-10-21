-- +goose Up
-- Composite ownership keys prevent cross-project delivery references.
ALTER TABLE endpoints ADD CONSTRAINT endpoints_project_id_id_key UNIQUE (project_id, id);

CREATE TABLE events (
    id             uuid        PRIMARY KEY,
    project_id     uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_type     text        NOT NULL CHECK (event_type ~ '^[a-z0-9][a-z0-9_.-]{2,127}$'),
    payload        bytea       NOT NULL CHECK (octet_length(payload) BETWEEN 1 AND 262144),
    request_hash   bytea       NOT NULL CHECK (octet_length(request_hash) = 32),
    delivery_count integer     NOT NULL DEFAULT 0 CHECK (delivery_count >= 0),
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, id)
);

CREATE INDEX events_project_created_id_idx ON events (project_id, created_at DESC, id DESC);

-- Expiring deduplication records are separate from immutable event data, so
-- a key can be reused after 24 hours without modifying or deleting its event.
CREATE TABLE event_idempotency_keys (
    project_id      uuid        NOT NULL,
    idempotency_key  text        NOT NULL CHECK (idempotency_key ~ '^[!-~]{1,255}$'),
    event_id        uuid        NOT NULL UNIQUE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    PRIMARY KEY (project_id, idempotency_key),
    FOREIGN KEY (project_id, event_id) REFERENCES events(project_id, id) ON DELETE CASCADE,
    CHECK (expires_at > created_at)
);

CREATE INDEX event_idempotency_keys_expiry_idx ON event_idempotency_keys (expires_at);

CREATE TABLE deliveries (
    id               uuid        PRIMARY KEY,
    project_id       uuid        NOT NULL,
    event_id         uuid        NOT NULL,
    endpoint_id      uuid        NOT NULL,
    state            text        NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'leased', 'succeeded', 'failed', 'canceled')),
    next_attempt_at  timestamptz NOT NULL DEFAULT now(),
    lease_token      uuid,
    lease_expires_at timestamptz,
    attempt_count    integer     NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    cycle            integer     NOT NULL DEFAULT 0 CHECK (cycle >= 0),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (event_id, endpoint_id),
    FOREIGN KEY (project_id, event_id) REFERENCES events(project_id, id) ON DELETE CASCADE,
    FOREIGN KEY (project_id, endpoint_id) REFERENCES endpoints(project_id, id) ON DELETE CASCADE,
    CHECK (
        (state = 'leased' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
        OR (state <> 'leased' AND lease_token IS NULL AND lease_expires_at IS NULL)
    )
);

CREATE INDEX deliveries_due_idx ON deliveries (next_attempt_at, id) WHERE state = 'pending';
CREATE INDEX deliveries_endpoint_pending_idx ON deliveries (project_id, endpoint_id) WHERE state = 'pending';
CREATE INDEX deliveries_project_created_id_idx ON deliveries (project_id, created_at DESC, id DESC);
CREATE INDEX deliveries_expired_lease_idx ON deliveries (lease_expires_at) WHERE state = 'leased';

-- +goose Down
DROP TABLE deliveries;
DROP TABLE event_idempotency_keys;
DROP TABLE events;
ALTER TABLE endpoints DROP CONSTRAINT endpoints_project_id_id_key;
