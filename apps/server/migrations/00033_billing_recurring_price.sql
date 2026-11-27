-- +goose Up
-- The price Dodo actually charges can differ from list price (country pricing, founding discount).
ALTER TABLE organization_billing
 ADD COLUMN recurring_amount integer CHECK (recurring_amount IS NULL OR recurring_amount >= 0),
 ADD COLUMN recurring_currency text CHECK (recurring_currency IS NULL OR recurring_currency ~ '^[A-Z]{3}$');

-- +goose Down
ALTER TABLE organization_billing DROP COLUMN recurring_currency, DROP COLUMN recurring_amount;
