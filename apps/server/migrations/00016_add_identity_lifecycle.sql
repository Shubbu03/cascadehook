-- +goose Up
CREATE TABLE revoked_sessions (
    identity_hash bytea PRIMARY KEY CHECK (octet_length(identity_hash) = 32),
    revoked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE identity_webhook_receipts (
    message_hash bytea PRIMARY KEY CHECK (octet_length(message_hash) = 32),
    body_hash bytea NOT NULL CHECK (octet_length(body_hash) = 32),
    received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX identity_webhook_receipts_age_idx ON identity_webhook_receipts (received_at);

CREATE TABLE organization_ownership_actions (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id),
    user_id uuid NOT NULL,
    operator_label text NOT NULL CHECK (char_length(operator_label) BETWEEN 1 AND 64),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX organization_ownership_actions_org_idx ON organization_ownership_actions (organization_id, id);

-- +goose Down
LOCK TABLE revoked_sessions, identity_webhook_receipts, organization_ownership_actions IN ACCESS EXCLUSIVE MODE;
-- Security tombstones must never be discarded by an accidental rollback.
-- +goose StatementBegin
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM revoked_sessions) OR EXISTS (SELECT 1 FROM identity_webhook_receipts)
        OR EXISTS (SELECT 1 FROM organization_ownership_actions) THEN
        RAISE EXCEPTION 'Identity security state exists; rollback requires an explicit recovery procedure';
    END IF;
END $$;
-- +goose StatementEnd
DROP TABLE organization_ownership_actions;
DROP TABLE identity_webhook_receipts;
DROP TABLE revoked_sessions;
