-- +goose Up
ALTER TABLE deliveries ADD COLUMN lease_owner uuid;

-- Earlier workers did not claim jobs. Requeue any manually leased rows rather
-- than inventing a process owner that can never release them.
UPDATE deliveries SET state = 'pending', lease_token = NULL,
    lease_expires_at = NULL, updated_at = now() WHERE state = 'leased';

ALTER TABLE deliveries ADD CONSTRAINT deliveries_lease_owner_check
    CHECK ((state = 'leased') = (lease_owner IS NOT NULL));

CREATE INDEX deliveries_lease_owner_idx ON deliveries (lease_owner, id) WHERE state = 'leased';

-- +goose Down
DROP INDEX deliveries_lease_owner_idx;
ALTER TABLE deliveries DROP CONSTRAINT deliveries_lease_owner_check;
ALTER TABLE deliveries DROP COLUMN lease_owner;
