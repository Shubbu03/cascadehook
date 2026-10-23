-- +goose Up
ALTER TABLE organizations
    ADD COLUMN quota_version bigint NOT NULL DEFAULT 0 CHECK (quota_version >= 0),
    ADD COLUMN max_projects integer NOT NULL DEFAULT 10 CHECK (max_projects BETWEEN 1 AND 1000),
    ADD COLUMN max_members integer NOT NULL DEFAULT 20 CHECK (max_members BETWEEN 1 AND 1000),
    ADD COLUMN max_endpoints_per_project integer NOT NULL DEFAULT 100 CHECK (max_endpoints_per_project BETWEEN 1 AND 1000),
    ADD COLUMN max_keys_per_project integer NOT NULL DEFAULT 20 CHECK (max_keys_per_project BETWEEN 1 AND 1000),
    ADD COLUMN max_monthly_events bigint NOT NULL DEFAULT 100000 CHECK (max_monthly_events BETWEEN 1 AND 1000000000000),
    ADD COLUMN max_monthly_deliveries bigint NOT NULL DEFAULT 1000000
        CHECK (max_monthly_deliveries BETWEEN 1 AND 1000000000000),
    ADD COLUMN max_payload_bytes_per_project bigint NOT NULL DEFAULT 1073741824
        CHECK (max_payload_bytes_per_project BETWEEN 262144 AND 1099511627776);

CREATE TABLE organization_quota_actions (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id),
    version bigint NOT NULL CHECK (version > 0),
    operator_label text NOT NULL CHECK (char_length(operator_label) BETWEEN 1 AND 64),
    limits jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (organization_id, version)
);

CREATE TABLE organization_usage_months (
    organization_id uuid NOT NULL REFERENCES organizations(id),
    period date NOT NULL,
    events bigint NOT NULL DEFAULT 0 CHECK (events >= 0),
    deliveries bigint NOT NULL DEFAULT 0 CHECK (deliveries >= 0),
    payload_bytes bigint NOT NULL DEFAULT 0 CHECK (payload_bytes >= 0),
    attempts bigint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    replays bigint NOT NULL DEFAULT 0 CHECK (replays >= 0),
    succeeded bigint NOT NULL DEFAULT 0 CHECK (succeeded >= 0),
    failed bigint NOT NULL DEFAULT 0 CHECK (failed >= 0),
    PRIMARY KEY (organization_id, period)
);

CREATE TABLE project_usage_months (
    project_id uuid NOT NULL REFERENCES projects(id),
    period date NOT NULL,
    events bigint NOT NULL DEFAULT 0 CHECK (events >= 0),
    deliveries bigint NOT NULL DEFAULT 0 CHECK (deliveries >= 0),
    payload_bytes bigint NOT NULL DEFAULT 0 CHECK (payload_bytes >= 0),
    attempts bigint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    replays bigint NOT NULL DEFAULT 0 CHECK (replays >= 0),
    succeeded bigint NOT NULL DEFAULT 0 CHECK (succeeded >= 0),
    failed bigint NOT NULL DEFAULT 0 CHECK (failed >= 0),
    PRIMARY KEY (project_id, period)
);

CREATE TABLE project_storage (
    project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    payload_bytes bigint NOT NULL DEFAULT 0 CHECK (payload_bytes >= 0)
);
INSERT INTO project_storage (project_id, payload_bytes)
    SELECT project_id, sum(octet_length(payload)) FROM events GROUP BY project_id;

-- Account for retained existing data. These are a documented lower bound for
-- months whose history was erased before usage metering was introduced.
INSERT INTO project_usage_months (project_id, period, events, deliveries, payload_bytes)
    SELECT project_id, date_trunc('month', created_at AT TIME ZONE 'UTC')::date,
        count(*), sum(delivery_count), sum(octet_length(payload))
    FROM events GROUP BY project_id, date_trunc('month', created_at AT TIME ZONE 'UTC')::date;
INSERT INTO organization_usage_months (organization_id, period, events, deliveries, payload_bytes)
    SELECT p.organization_id, u.period, sum(u.events), sum(u.deliveries), sum(u.payload_bytes)
    FROM project_usage_months u JOIN projects p ON p.id = u.project_id GROUP BY p.organization_id, u.period;

-- +goose Down
LOCK TABLE organizations, organization_usage_months, project_usage_months, project_storage,
    organization_quota_actions IN ACCESS EXCLUSIVE MODE;
-- +goose StatementBegin
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM organization_usage_months) OR EXISTS (SELECT 1 FROM project_usage_months)
        OR EXISTS (SELECT 1 FROM organization_quota_actions) THEN
        RAISE EXCEPTION 'Usage or quota audit exists; rollback must not silently erase accounting';
    END IF;
END $$;
-- +goose StatementEnd
DROP TABLE project_storage;
DROP TABLE project_usage_months;
DROP TABLE organization_usage_months;
DROP TABLE organization_quota_actions;
ALTER TABLE organizations DROP COLUMN max_payload_bytes_per_project, DROP COLUMN max_monthly_deliveries,
    DROP COLUMN max_monthly_events, DROP COLUMN max_keys_per_project, DROP COLUMN max_endpoints_per_project,
    DROP COLUMN max_members, DROP COLUMN max_projects, DROP COLUMN quota_version;
