-- +goose Up
-- A founding customer who switches billing interval redeems the other founding code too;
-- the flag keeps the shared founding limit counting each organization once.
ALTER TABLE organization_billing ADD COLUMN founding_carried boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE organization_billing DROP COLUMN founding_carried;
