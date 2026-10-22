-- +goose Up
ALTER TABLE api_keys
    ADD COLUMN expires_at timestamptz CHECK (expires_at > created_at),
    ADD COLUMN revokes_at timestamptz,
    ADD COLUMN rotated_to_id uuid,
    -- Actor IDs are audit snapshots, retained independently of key retention.
    ADD COLUMN created_by_api_key_id uuid,
    ADD COLUMN revoked_by_api_key_id uuid,
    ADD CONSTRAINT api_keys_project_id_id_key UNIQUE (project_id, id),
    ADD CONSTRAINT api_keys_rotation_target_fk FOREIGN KEY (project_id, rotated_to_id)
        REFERENCES api_keys(project_id, id),
    ADD CONSTRAINT api_keys_rotation_pair_check CHECK ((revokes_at IS NULL) = (rotated_to_id IS NULL)),
    ADD CONSTRAINT api_keys_rotation_self_check CHECK (rotated_to_id IS NULL OR rotated_to_id <> id);

CREATE INDEX api_keys_project_created_id_idx ON api_keys (project_id, created_at DESC, id DESC);

-- +goose Down
DROP INDEX api_keys_project_created_id_idx;
ALTER TABLE api_keys
    DROP CONSTRAINT api_keys_rotation_self_check,
    DROP CONSTRAINT api_keys_rotation_pair_check,
    DROP CONSTRAINT api_keys_rotation_target_fk,
    DROP CONSTRAINT api_keys_project_id_id_key,
    DROP COLUMN revoked_by_api_key_id,
    DROP COLUMN created_by_api_key_id,
    DROP COLUMN rotated_to_id,
    DROP COLUMN revokes_at,
    DROP COLUMN expires_at;
