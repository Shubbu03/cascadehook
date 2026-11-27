-- +goose Up
-- Shows the owner the discounted renewal amount and how many discounted renewals remain.
ALTER TABLE organization_billing
 ADD COLUMN discount_percent integer CHECK (discount_percent IS NULL OR discount_percent BETWEEN 1 AND 100),
 ADD COLUMN discount_cycles_remaining integer CHECK (discount_cycles_remaining IS NULL OR discount_cycles_remaining >= 0);

-- +goose Down
ALTER TABLE organization_billing DROP COLUMN discount_cycles_remaining, DROP COLUMN discount_percent;
