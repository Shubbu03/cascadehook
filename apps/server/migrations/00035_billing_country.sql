-- +goose Up
-- Prices are shown in the customer's own currency, which Dodo derives from the billing country.
ALTER TABLE organization_billing
 ADD COLUMN billing_country text CHECK (billing_country IS NULL OR billing_country ~ '^[A-Z]{2}$');

-- +goose Down
ALTER TABLE organization_billing DROP COLUMN billing_country;
