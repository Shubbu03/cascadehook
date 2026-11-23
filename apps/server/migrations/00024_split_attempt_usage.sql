-- +goose Up
-- Attempt outcomes no longer update the shared organization row on every
-- attempt. Organization totals become retired_* (counts folded in from
-- deleted projects) plus the sum of live project rows. The old attempts,
-- succeeded, and failed columns stay so binaries still running during a
-- rollout can write to them; nothing reads them after this migration.
-- Stop and drain old janitors before migrating: their project cleanup does
-- not transfer deleted project counters into retired_*.
ALTER TABLE organization_usage_months
    ADD COLUMN retired_attempts bigint NOT NULL DEFAULT 0 CHECK (retired_attempts >= 0),
    ADD COLUMN retired_succeeded bigint NOT NULL DEFAULT 0 CHECK (retired_succeeded >= 0),
    ADD COLUMN retired_failed bigint NOT NULL DEFAULT 0 CHECK (retired_failed >= 0);

-- Freeze both counters while computing the share of deleted projects.
LOCK TABLE organization_usage_months, project_usage_months IN SHARE ROW EXCLUSIVE MODE;

UPDATE organization_usage_months o SET
    retired_attempts = greatest(o.attempts - live.attempts, 0),
    retired_succeeded = greatest(o.succeeded - live.succeeded, 0),
    retired_failed = greatest(o.failed - live.failed, 0)
FROM (
    SELECT o.organization_id, o.period,
        coalesce(sum(u.attempts), 0) AS attempts,
        coalesce(sum(u.succeeded), 0) AS succeeded,
        coalesce(sum(u.failed), 0) AS failed
    FROM organization_usage_months o
    LEFT JOIN projects p ON p.organization_id = o.organization_id
    LEFT JOIN project_usage_months u ON u.project_id = p.id AND u.period = o.period
    GROUP BY o.organization_id, o.period
) live
WHERE live.organization_id = o.organization_id AND live.period = o.period;

-- +goose Down
LOCK TABLE organization_usage_months, project_usage_months IN SHARE ROW EXCLUSIVE MODE;

-- A retry-only month may have project counters without an organization row.
-- Materialize those month keys before restoring totals, leaving existing
-- publication, delivery, payload, and replay counters unchanged.
INSERT INTO organization_usage_months (organization_id, period)
SELECT DISTINCT p.organization_id, u.period
FROM project_usage_months u
JOIN projects p ON p.id = u.project_id
ON CONFLICT (organization_id, period) DO NOTHING;

-- Restore the combined counters that earlier binaries read and increment.
UPDATE organization_usage_months o SET
    attempts = o.retired_attempts + live.attempts,
    succeeded = o.retired_succeeded + live.succeeded,
    failed = o.retired_failed + live.failed
FROM (
    SELECT o.organization_id, o.period,
        coalesce(sum(u.attempts), 0) AS attempts,
        coalesce(sum(u.succeeded), 0) AS succeeded,
        coalesce(sum(u.failed), 0) AS failed
    FROM organization_usage_months o
    LEFT JOIN projects p ON p.organization_id = o.organization_id
    LEFT JOIN project_usage_months u ON u.project_id = p.id AND u.period = o.period
    GROUP BY o.organization_id, o.period
) live
WHERE live.organization_id = o.organization_id AND live.period = o.period;

ALTER TABLE organization_usage_months
    DROP COLUMN retired_failed,
    DROP COLUMN retired_succeeded,
    DROP COLUMN retired_attempts;
