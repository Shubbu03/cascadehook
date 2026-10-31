-- +goose Up
ALTER TABLE projects ADD CONSTRAINT projects_organization_id_id_key UNIQUE (organization_id, id);

CREATE TABLE notifications (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id),
    project_id uuid,
    type text NOT NULL CHECK (char_length(type) BETWEEN 1 AND 64),
    category text NOT NULL CHECK (category IN ('team', 'access', 'project', 'credentials', 'usage', 'delivery')),
    severity text NOT NULL CHECK (severity IN ('info', 'success', 'warning', 'error')),
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 600),
    resource_type text NOT NULL CHECK (resource_type IN ('members', 'project', 'api_key', 'endpoint', 'usage')),
    resource_id uuid,
    actor_user_id uuid,
    source_key text NOT NULL CHECK (char_length(source_key) BETWEEN 1 AND 255),
    occurrence_count bigint NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (organization_id, id),
    UNIQUE (organization_id, source_key),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);
CREATE INDEX notifications_organization_created_idx ON notifications (organization_id, created_at DESC, id DESC);
CREATE INDEX notifications_project_idx ON notifications (project_id, id) WHERE project_id IS NOT NULL;
CREATE INDEX notifications_retention_idx ON notifications (created_at, id);

CREATE TABLE notification_recipients (
    organization_id uuid NOT NULL,
    notification_id uuid NOT NULL,
    -- Snapshot identity avoids taking user locks after organization/project locks.
    -- Reads require an active user and the same current membership generation.
    user_id uuid NOT NULL,
    membership_created_at timestamptz NOT NULL,
    required_role text NOT NULL CHECK (required_role IN ('member', 'manager', 'owner')),
    read_at timestamptz,
    archived_at timestamptz,
    PRIMARY KEY (notification_id, user_id),
    FOREIGN KEY (organization_id, notification_id) REFERENCES notifications(organization_id, id)
);
CREATE INDEX notification_recipients_inbox_idx ON notification_recipients (user_id, organization_id, notification_id);
CREATE INDEX notification_recipients_unread_idx ON notification_recipients (user_id, organization_id, notification_id)
    WHERE read_at IS NULL AND archived_at IS NULL;
CREATE INDEX notification_recipients_organization_idx ON notification_recipients (organization_id, notification_id, user_id);

-- One durable incident per endpoint, shared by all workers. Notification IDs
-- are snapshots: retention can remove old notices while the condition persists.
CREATE TABLE notification_delivery_state (
    endpoint_id uuid PRIMARY KEY,
    project_id uuid NOT NULL,
    organization_id uuid NOT NULL REFERENCES organizations(id),
    notification_id uuid NOT NULL,
    failure_count bigint NOT NULL CHECK (failure_count > 0),
    last_failure_at timestamptz NOT NULL,
    recovered_at timestamptz,
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    FOREIGN KEY (project_id, endpoint_id) REFERENCES endpoints(project_id, id)
);
CREATE INDEX notification_delivery_state_project_idx ON notification_delivery_state (project_id, endpoint_id);

CREATE INDEX api_keys_notification_expiry_idx ON api_keys (expires_at, id)
    WHERE expires_at IS NOT NULL AND revoked_at IS NULL AND revokes_at IS NULL;

-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM notifications) OR EXISTS (SELECT 1 FROM notification_delivery_state) THEN
        RAISE EXCEPTION 'Notification state exists; rollback requires explicit cleanup';
    END IF;
END $$;
-- +goose StatementEnd
DROP INDEX api_keys_notification_expiry_idx;
DROP TABLE notification_delivery_state;
DROP TABLE notification_recipients;
DROP TABLE notifications;
ALTER TABLE projects DROP CONSTRAINT projects_organization_id_id_key;
