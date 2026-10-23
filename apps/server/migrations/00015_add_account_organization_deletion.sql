-- +goose Up
ALTER TABLE organizations
    ADD COLUMN deletion_requested_at timestamptz,
    ADD COLUMN deletion_requested_by_user_id uuid,
    ADD CONSTRAINT organizations_deletion_pair_check
        CHECK ((deletion_requested_at IS NULL) = (deletion_requested_by_user_id IS NULL));

ALTER TABLE users
    ADD COLUMN deletion_requested_at timestamptz,
    ADD COLUMN provider_deleted_at timestamptz,
    ADD COLUMN provider_delete_after timestamptz,
    ADD COLUMN provider_delete_token uuid,
    ADD COLUMN provider_delete_lease_expires_at timestamptz,
    ADD COLUMN provider_delete_attempts integer NOT NULL DEFAULT 0 CHECK (provider_delete_attempts BETWEEN 0 AND 1000000),
    ADD CONSTRAINT users_provider_delete_lease_check
        CHECK ((provider_delete_token IS NULL) = (provider_delete_lease_expires_at IS NULL)),
    ADD CONSTRAINT users_deletion_state_check CHECK (
        (deletion_requested_at IS NULL AND provider_deleted_at IS NULL AND provider_delete_after IS NULL
            AND provider_delete_token IS NULL AND provider_delete_attempts = 0)
        OR (deletion_requested_at IS NOT NULL AND provider_delete_after IS NOT NULL)
    );

-- Minimal suppression record: no raw provider identifier or local user ID.
-- Prevents still-valid tokens from provisioning the same identity after erasure.
CREATE TABLE deleted_account_identities (
    identity_hash bytea PRIMARY KEY CHECK (octet_length(identity_hash) = 32),
    deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organizations_deletion_pending_idx ON organizations (deletion_requested_at, id)
    WHERE deletion_requested_at IS NOT NULL;
CREATE INDEX users_deletion_pending_idx ON users (deletion_requested_at, id)
    WHERE deletion_requested_at IS NOT NULL;
CREATE INDEX users_provider_delete_due_idx ON users (identity_issuer, provider_delete_after, id)
    WHERE deletion_requested_at IS NOT NULL AND provider_deleted_at IS NULL;

-- +goose Down
LOCK TABLE organizations, users, deleted_account_identities IN ACCESS EXCLUSIVE MODE;
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM organizations WHERE deletion_requested_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM users WHERE deletion_requested_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM deleted_account_identities) THEN
        RAISE EXCEPTION 'Deletion state or identity suppression exists; rollback must not reactivate erased accounts';
    END IF;
END;
$$;
-- +goose StatementEnd
DROP INDEX users_provider_delete_due_idx;
DROP INDEX users_deletion_pending_idx;
DROP INDEX organizations_deletion_pending_idx;
DROP TABLE deleted_account_identities;
ALTER TABLE users
    DROP CONSTRAINT users_deletion_state_check,
    DROP CONSTRAINT users_provider_delete_lease_check,
    DROP COLUMN provider_delete_attempts,
    DROP COLUMN provider_delete_lease_expires_at,
    DROP COLUMN provider_delete_token,
    DROP COLUMN provider_delete_after,
    DROP COLUMN provider_deleted_at,
    DROP COLUMN deletion_requested_at;
ALTER TABLE organizations
    DROP CONSTRAINT organizations_deletion_pair_check,
    DROP COLUMN deletion_requested_by_user_id,
    DROP COLUMN deletion_requested_at;
