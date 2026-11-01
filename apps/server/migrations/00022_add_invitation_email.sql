-- +goose Up
ALTER TABLE organization_invitations ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
CREATE TABLE email_outbox (
    id uuid PRIMARY KEY,
    invitation_id uuid NOT NULL REFERENCES organization_invitations(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES organizations(id),
    created_by_user_id uuid NOT NULL,
    state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','sending','sent','delivered','failed','bounced','complained','suppressed','cancelled')),
    payload_ciphertext bytea,
    clerk_invitation_id text,
    clerk_revoked_at timestamptz,
    provider_message_id text UNIQUE,
    attempts integer NOT NULL DEFAULT 0,
    lease_id uuid,
    leased_until timestamptz,
    first_attempt_at timestamptz,
    next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    last_error text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    provider_event_at timestamptz
);
CREATE INDEX email_outbox_dispatch_idx ON email_outbox (next_attempt_at, id) WHERE state IN ('queued','sending');
CREATE INDEX email_outbox_invitation_idx ON email_outbox (invitation_id, created_at DESC, id DESC);
CREATE INDEX email_outbox_actor_idx ON email_outbox (created_by_user_id, created_at);
CREATE TABLE email_send_budgets (day date PRIMARY KEY, attempts integer NOT NULL DEFAULT 0);
CREATE TABLE email_delivery_events (
    id text PRIMARY KEY,
    provider_message_id text NOT NULL,
    state text NOT NULL,
    occurred_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX email_delivery_events_message_idx ON email_delivery_events (provider_message_id, occurred_at DESC);

-- +goose Down
LOCK TABLE email_outbox IN ACCESS EXCLUSIVE MODE;
-- +goose StatementBegin
DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM email_outbox) THEN
        RAISE EXCEPTION 'Invitation delivery state exists; rollback requires explicit cleanup';
    END IF;
END $$;
-- +goose StatementEnd
DROP TABLE email_delivery_events, email_send_budgets, email_outbox;
ALTER TABLE organization_invitations DROP COLUMN project_id;
