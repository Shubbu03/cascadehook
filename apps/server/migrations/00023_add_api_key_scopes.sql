-- +goose Up
-- Existing keys keep the full project access they were issued with. Scope is
-- immutable after issue; rotation copies it to the replacement.
ALTER TABLE api_keys ADD COLUMN scope text NOT NULL DEFAULT 'full'
    CHECK (scope IN ('full', 'publish', 'read'));

-- +goose Down
LOCK TABLE api_keys IN ACCESS EXCLUSIVE MODE;
-- +goose StatementBegin
DO $$ BEGIN
    -- Dropping the column would silently grant restricted keys full access.
    IF EXISTS (SELECT 1 FROM api_keys WHERE scope <> 'full' AND revoked_at IS NULL) THEN
        RAISE EXCEPTION 'Unrevoked restricted API keys exist; revoke them before rolling back';
    END IF;
END $$;
-- +goose StatementEnd
ALTER TABLE api_keys DROP COLUMN scope;
