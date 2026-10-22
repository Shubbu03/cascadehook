-- +goose Up
CREATE TABLE users (
    id uuid PRIMARY KEY,
    identity_issuer text NOT NULL CHECK (char_length(identity_issuer) BETWEEN 1 AND 255),
    identity_subject text NOT NULL CHECK (char_length(identity_subject) BETWEEN 1 AND 255),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (identity_issuer, identity_subject)
);

CREATE TABLE memberships (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id),
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX memberships_user_organization_idx ON memberships (user_id, organization_id);
CREATE INDEX memberships_organization_created_user_idx ON memberships (organization_id, created_at DESC, user_id DESC);
CREATE INDEX projects_organization_created_id_idx ON projects (organization_id, created_at DESC, id DESC);

-- Actor IDs are retained as audit snapshots, independent of account retention.
ALTER TABLE api_keys
    ADD COLUMN created_by_user_id uuid,
    ADD COLUMN revoked_by_user_id uuid,
    ADD CONSTRAINT api_keys_creation_actor_check CHECK (created_by_api_key_id IS NULL OR created_by_user_id IS NULL),
    ADD CONSTRAINT api_keys_revocation_actor_check CHECK (revoked_by_api_key_id IS NULL OR revoked_by_user_id IS NULL);

ALTER TABLE delivery_replays
    ALTER COLUMN api_key_id DROP NOT NULL,
    ADD COLUMN user_id uuid,
    ADD CONSTRAINT delivery_replays_actor_check CHECK ((api_key_id IS NULL) <> (user_id IS NULL));

-- Existing development organizations deliberately receive no human membership.
-- A sign-in or matching email must never claim previously seeded tenant data.

-- +goose Down
-- Refuse rollback while human replay audit records exist, rather than erase them.
ALTER TABLE delivery_replays
    ALTER COLUMN api_key_id SET NOT NULL,
    DROP CONSTRAINT delivery_replays_actor_check,
    DROP COLUMN user_id;
ALTER TABLE api_keys
    DROP CONSTRAINT api_keys_creation_actor_check,
    DROP CONSTRAINT api_keys_revocation_actor_check,
    DROP COLUMN created_by_user_id,
    DROP COLUMN revoked_by_user_id;
DROP INDEX projects_organization_created_id_idx;
DROP TABLE memberships;
DROP TABLE users;
