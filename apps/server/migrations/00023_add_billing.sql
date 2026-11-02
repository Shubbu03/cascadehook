-- +goose Up
-- Existing workspaces keep their current allowances until choosing a paid plan.
ALTER TABLE organizations
 ADD COLUMN billing_plan text NOT NULL DEFAULT 'legacy' CHECK (billing_plan IN ('legacy','free','starter','growth')),
 ADD COLUMN billing_access_until timestamptz,
 ADD COLUMN history_retention_days integer NOT NULL DEFAULT 30 CHECK (history_retention_days BETWEEN 1 AND 3650);
ALTER TABLE organizations ALTER COLUMN billing_plan SET DEFAULT 'free';
ALTER TABLE organizations ALTER COLUMN history_retention_days SET DEFAULT 7;
ALTER TABLE organizations ALTER COLUMN max_projects SET DEFAULT 1;
ALTER TABLE organizations ALTER COLUMN max_members SET DEFAULT 1;
ALTER TABLE organizations ALTER COLUMN max_endpoints_per_project SET DEFAULT 3;
ALTER TABLE organizations ALTER COLUMN max_keys_per_project SET DEFAULT 5;
ALTER TABLE organizations ALTER COLUMN max_monthly_events SET DEFAULT 5000;
ALTER TABLE organizations ALTER COLUMN max_monthly_deliveries SET DEFAULT 5000;
ALTER TABLE organizations ALTER COLUMN max_payload_bytes_per_project SET DEFAULT 104857600;

CREATE TABLE organization_billing (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 customer_id text UNIQUE,
 subscription_id text UNIQUE,
 status text NOT NULL DEFAULT 'free',
 billing_interval text NOT NULL DEFAULT '' CHECK (billing_interval IN ('','monthly','annual')),
 paid_through timestamptz,
 cancel_at_period_end boolean NOT NULL DEFAULT false,
 synced_at timestamptz,
 sync_attempt_at timestamptz,
 scheduled_product text,
 scheduled_at timestamptz,
 checkout_session_id text,
 checkout_id uuid UNIQUE,
 checkout_product_id text,
 checkout_url text,
 action_at timestamptz NOT NULL DEFAULT '-infinity',
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK (checkout_id IS NOT NULL OR (checkout_product_id IS NULL AND checkout_url IS NULL))
);
CREATE TABLE billing_webhook_receipts (
 id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 255),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX billing_receipts_received_idx ON billing_webhook_receipts(received_at);
-- Keep historical bindings so delayed events cannot replace a newer subscription.
CREATE TABLE billing_subscriptions (
 subscription_id text PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX billing_subscriptions_organization_idx ON billing_subscriptions(organization_id);
CREATE TABLE billing_recovery_actions (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 checkout_id uuid NOT NULL,
 operator_label text NOT NULL,
 provider_reference text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Expiry is enforced at admission even when a renewal webhook or job is missing.
CREATE VIEW organization_entitlements AS
 SELECT id,quota_version,deletion_requested_at,
 CASE WHEN billing_plan IN ('starter','growth') AND (billing_access_until IS NULL OR billing_access_until <= clock_timestamp()) THEN 'free' ELSE billing_plan END AS plan,
 CASE WHEN billing_plan IN ('starter','growth') AND (billing_access_until IS NULL OR billing_access_until <= clock_timestamp()) THEN 1 ELSE max_projects END AS max_projects,
 CASE WHEN billing_plan IN ('starter','growth') AND (billing_access_until IS NULL OR billing_access_until <= clock_timestamp()) THEN 1 ELSE max_members END AS max_members,
 CASE WHEN billing_plan IN ('starter','growth') AND (billing_access_until IS NULL OR billing_access_until <= clock_timestamp()) THEN 3 ELSE max_endpoints_per_project END AS max_endpoints_per_project,
 CASE WHEN billing_plan IN ('starter','growth') AND (billing_access_until IS NULL OR billing_access_until <= clock_timestamp()) THEN 5 ELSE max_keys_per_project END AS max_keys_per_project,
 CASE WHEN billing_plan IN ('starter','growth') AND (billing_access_until IS NULL OR billing_access_until <= clock_timestamp()) THEN 5000::bigint ELSE max_monthly_events END AS max_monthly_events,
 CASE WHEN billing_plan IN ('starter','growth') AND (billing_access_until IS NULL OR billing_access_until <= clock_timestamp()) THEN 5000::bigint ELSE max_monthly_deliveries END AS max_monthly_deliveries,
 CASE WHEN billing_plan IN ('starter','growth') AND (billing_access_until IS NULL OR billing_access_until <= clock_timestamp()) THEN 104857600::bigint ELSE max_payload_bytes_per_project END AS max_payload_bytes_per_project,
 CASE WHEN billing_plan IN ('starter','growth') AND (billing_access_until IS NULL OR billing_access_until <= clock_timestamp()) THEN 7 ELSE history_retention_days END AS retention_days
 FROM organizations;

-- +goose Down
DROP VIEW organization_entitlements;
DROP TABLE billing_recovery_actions;
DROP TABLE billing_subscriptions;
DROP TABLE billing_webhook_receipts;
DROP TABLE organization_billing;
ALTER TABLE organizations DROP COLUMN billing_plan,DROP COLUMN billing_access_until,DROP COLUMN history_retention_days;
ALTER TABLE organizations ALTER COLUMN max_projects SET DEFAULT 10;
ALTER TABLE organizations ALTER COLUMN max_members SET DEFAULT 20;
ALTER TABLE organizations ALTER COLUMN max_endpoints_per_project SET DEFAULT 100;
ALTER TABLE organizations ALTER COLUMN max_keys_per_project SET DEFAULT 20;
ALTER TABLE organizations ALTER COLUMN max_monthly_events SET DEFAULT 100000;
ALTER TABLE organizations ALTER COLUMN max_monthly_deliveries SET DEFAULT 1000000;
ALTER TABLE organizations ALTER COLUMN max_payload_bytes_per_project SET DEFAULT 1073741824;
