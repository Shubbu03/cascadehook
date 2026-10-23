-- +goose Up
ALTER TABLE users ADD COLUMN invitation_lookup_at timestamptz;
CREATE TABLE organization_invitations (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id),
    email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
    role text NOT NULL CHECK (role IN ('admin','member')),
    token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    created_by_user_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '7 days',
    accepted_at timestamptz,
    accepted_by_user_id uuid,
    revoked_at timestamptz,
    CHECK ((accepted_at IS NULL) = (accepted_by_user_id IS NULL)),
    CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);
CREATE UNIQUE INDEX organization_invitations_pending_email_idx
    ON organization_invitations (organization_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX organization_invitations_page_idx ON organization_invitations (organization_id, created_at DESC, id DESC);
CREATE INDEX organization_invitations_expiry_idx ON organization_invitations (expires_at, id);

-- +goose Down
LOCK TABLE users, organization_invitations IN ACCESS EXCLUSIVE MODE;
-- +goose StatementBegin
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM organization_invitations) THEN
        RAISE EXCEPTION 'Invitation state exists; rollback requires explicit cleanup';
    END IF;
END $$;
-- +goose StatementEnd
DROP TABLE organization_invitations;
ALTER TABLE users DROP COLUMN invitation_lookup_at;
