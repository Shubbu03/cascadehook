-- +goose Up
ALTER TABLE projects
    ADD COLUMN deletion_requested_at timestamptz,
    -- Audit snapshot, independent of future user/account retention.
    ADD COLUMN deletion_requested_by_user_id uuid,
    ADD CONSTRAINT projects_deletion_pair_check
        CHECK ((deletion_requested_at IS NULL) = (deletion_requested_by_user_id IS NULL));

CREATE INDEX projects_deletion_pending_idx ON projects (deletion_requested_at, id)
    WHERE deletion_requested_at IS NOT NULL;
CREATE INDEX deliveries_project_leases_idx ON deliveries (project_id, lease_expires_at)
    WHERE state = 'leased';
CREATE INDEX delivery_replays_project_id_idx ON delivery_replays (project_id, id);
CREATE INDEX api_keys_rotation_target_idx ON api_keys (project_id, rotated_to_id)
    WHERE rotated_to_id IS NOT NULL;

-- +goose Down
LOCK TABLE projects IN ACCESS EXCLUSIVE MODE;
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM projects WHERE deletion_requested_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Pending project deletions must finish before rollback; partially deleted data cannot be restored';
    END IF;
END;
$$;
-- +goose StatementEnd
DROP INDEX api_keys_rotation_target_idx;
DROP INDEX delivery_replays_project_id_idx;
DROP INDEX deliveries_project_leases_idx;
DROP INDEX projects_deletion_pending_idx;
ALTER TABLE projects
    DROP CONSTRAINT projects_deletion_pair_check,
    DROP COLUMN deletion_requested_by_user_id,
    DROP COLUMN deletion_requested_at;
