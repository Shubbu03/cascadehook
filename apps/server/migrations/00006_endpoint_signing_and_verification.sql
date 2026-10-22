-- +goose Up
ALTER TABLE endpoints
    ADD COLUMN signing_secret bytea CHECK (signing_secret IS NULL OR octet_length(signing_secret) = 61),
    ADD COLUMN signing_secret_updated_at timestamptz,
    ADD COLUMN previous_signing_secret bytea CHECK (previous_signing_secret IS NULL OR octet_length(previous_signing_secret) = 61),
    ADD COLUMN previous_secret_expires_at timestamptz,
    ADD COLUMN verification_version bigint NOT NULL DEFAULT 0 CHECK (verification_version >= 0),
    ADD COLUMN verification_attempted_at timestamptz,
    ADD CONSTRAINT endpoints_secret_timestamp_check
        CHECK ((signing_secret IS NULL) = (signing_secret_updated_at IS NULL)),
    ADD CONSTRAINT endpoints_previous_secret_check CHECK (
        (previous_signing_secret IS NULL AND previous_secret_expires_at IS NULL)
        OR (signing_secret IS NOT NULL AND previous_signing_secret IS NOT NULL AND previous_secret_expires_at IS NOT NULL)
    );

-- An older manually verified endpoint has no signing credential yet. Require
-- provisioning and a real ownership challenge before allowing it to send.
UPDATE endpoints SET enabled = false, verified_at = NULL, updated_at = now()
    WHERE enabled OR verified_at IS NOT NULL;

ALTER TABLE endpoints ADD CONSTRAINT endpoints_enabled_secret_check
    CHECK (NOT enabled OR signing_secret IS NOT NULL);

-- +goose Down
ALTER TABLE endpoints
    DROP CONSTRAINT endpoints_enabled_secret_check,
    DROP CONSTRAINT endpoints_previous_secret_check,
    DROP CONSTRAINT endpoints_secret_timestamp_check,
    DROP COLUMN verification_attempted_at,
    DROP COLUMN verification_version,
    DROP COLUMN previous_secret_expires_at,
    DROP COLUMN previous_signing_secret,
    DROP COLUMN signing_secret_updated_at,
    DROP COLUMN signing_secret;
