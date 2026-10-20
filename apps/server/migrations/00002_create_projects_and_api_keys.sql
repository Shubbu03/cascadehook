-- +goose Up
CREATE TABLE projects (
    id              uuid        PRIMARY KEY,
    organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100 AND btrim(name) <> ''),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projects_organization_id_idx ON projects (organization_id);

CREATE TABLE api_keys (
    id         uuid        PRIMARY KEY,
    project_id uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100 AND btrim(name) <> ''),
    key_prefix text        NOT NULL CHECK (key_prefix ~ '^ch_(dev|live)_[0-9a-f]{12}$'),
    key_hash   bytea       NOT NULL UNIQUE CHECK (octet_length(key_hash) = 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
);

CREATE INDEX api_keys_project_id_idx ON api_keys (project_id);

-- +goose Down
DROP TABLE api_keys;
DROP TABLE projects;
