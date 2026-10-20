-- +goose Up
CREATE TABLE endpoints (
    id          uuid        PRIMARY KEY,
    project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    url         text        NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2048 AND url LIKE 'https://%'),
    enabled     boolean     NOT NULL DEFAULT false,
    verified_at timestamptz,
    deleted_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CHECK (NOT enabled OR (verified_at IS NOT NULL AND deleted_at IS NULL))
);

CREATE INDEX endpoints_project_created_id_idx
    ON endpoints (project_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE endpoint_subscriptions (
    endpoint_id uuid NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
    event_type  text NOT NULL CHECK (event_type ~ '^[a-z0-9][a-z0-9_.-]{2,127}$'),
    PRIMARY KEY (endpoint_id, event_type)
);

-- +goose Down
DROP TABLE endpoint_subscriptions;
DROP TABLE endpoints;
