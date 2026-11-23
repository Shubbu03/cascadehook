-- +goose Up
ALTER TABLE projects
    ADD COLUMN description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
    ADD COLUMN environment text NOT NULL DEFAULT '' CHECK (environment IN ('','production','staging','development'));

CREATE TABLE project_delivery_policies (
    project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 8),
    timeout_seconds integer NOT NULL DEFAULT 30 CHECK (timeout_seconds BETWEEN 1 AND 30),
    retry_delays_seconds integer[] NOT NULL DEFAULT ARRAY[15,60,300,1800,7200,21600,64800],
    CHECK (array_ndims(retry_delays_seconds)=1 AND cardinality(retry_delays_seconds)=7
        AND array_position(retry_delays_seconds,NULL) IS NULL
        AND 1 <= ALL(retry_delays_seconds) AND 64800 >= ALL(retry_delays_seconds))
);

-- Each delivery cycle keeps its policy even if the project's defaults change.
-- Constant defaults avoid a table rewrite. The checks are NOT VALID so this
-- exclusive lock never waits on a full scan; 00030 validates them afterwards.
ALTER TABLE deliveries
    ADD COLUMN max_attempts integer NOT NULL DEFAULT 8,
    ADD COLUMN timeout_seconds integer NOT NULL DEFAULT 30,
    ADD COLUMN retry_delays_seconds integer[] NOT NULL DEFAULT ARRAY[15,60,300,1800,7200,21600,64800],
    ADD CONSTRAINT deliveries_max_attempts_check CHECK (max_attempts BETWEEN 1 AND 8) NOT VALID,
    ADD CONSTRAINT deliveries_timeout_seconds_check CHECK (timeout_seconds BETWEEN 1 AND 30) NOT VALID,
    ADD CONSTRAINT deliveries_retry_policy_check CHECK (array_ndims(retry_delays_seconds)=1
        AND cardinality(retry_delays_seconds)=7 AND array_position(retry_delays_seconds,NULL) IS NULL
        AND 1 <= ALL(retry_delays_seconds) AND 64800 >= ALL(retry_delays_seconds)) NOT VALID;

ALTER TABLE notification_preferences ADD COLUMN email_severities text[] NOT NULL DEFAULT ARRAY['info','success','warning','error']
    CHECK (email_severities <@ ARRAY['info','success','warning','error']::text[]);
CREATE TABLE organization_notification_preferences (
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    email_enabled boolean NOT NULL DEFAULT true,
    PRIMARY KEY (organization_id,user_id),
    FOREIGN KEY (organization_id,user_id) REFERENCES memberships(organization_id,user_id) ON DELETE CASCADE
);

CREATE TABLE retention_policy_reports (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    history_days integer NOT NULL CHECK (history_days BETWEEN 1 AND 3650),
    notification_days integer NOT NULL CHECK (notification_days BETWEEN 1 AND 3650),
    reported_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM project_delivery_policies)
        OR EXISTS (SELECT 1 FROM deliveries WHERE max_attempts<>8 OR timeout_seconds<>30
            OR retry_delays_seconds<>ARRAY[15,60,300,1800,7200,21600,64800]) THEN
        RAISE EXCEPTION 'Custom delivery policies exist; rollback requires explicit recovery';
    END IF;
END $$;
-- +goose StatementEnd
DROP TABLE retention_policy_reports;
DROP TABLE organization_notification_preferences;
ALTER TABLE notification_preferences DROP COLUMN email_severities;
ALTER TABLE deliveries DROP CONSTRAINT deliveries_retry_policy_check,
    DROP CONSTRAINT deliveries_max_attempts_check, DROP CONSTRAINT deliveries_timeout_seconds_check,
    DROP COLUMN max_attempts, DROP COLUMN timeout_seconds, DROP COLUMN retry_delays_seconds;
DROP TABLE project_delivery_policies;
ALTER TABLE projects DROP COLUMN description, DROP COLUMN environment;
