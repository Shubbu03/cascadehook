-- +goose Up
-- A payment Dodo accepted but we could not activate must stay visible until it is reconciled.
ALTER TABLE organization_billing
 ADD COLUMN sync_error text CHECK (sync_error IS NULL OR length(sync_error) BETWEEN 1 AND 300),
 ADD COLUMN sync_error_subscription text,
 ADD COLUMN sync_error_at timestamptz,
 ADD CONSTRAINT organization_billing_sync_error_pair_check CHECK ((sync_error IS NULL) = (sync_error_at IS NULL));
CREATE INDEX organization_billing_sync_error_idx ON organization_billing(sync_error_at) WHERE sync_error IS NOT NULL;

-- +goose Down
DROP INDEX organization_billing_sync_error_idx;
ALTER TABLE organization_billing
 DROP CONSTRAINT organization_billing_sync_error_pair_check,
 DROP COLUMN sync_error_at,
 DROP COLUMN sync_error_subscription,
 DROP COLUMN sync_error;
