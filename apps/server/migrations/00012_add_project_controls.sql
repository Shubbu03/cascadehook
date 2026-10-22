-- +goose Up
ALTER TABLE projects
    ADD COLUMN suspended_at timestamptz,
    ADD COLUMN suspension_reason text CHECK (suspension_reason ~ '^[a-z][a-z0-9_]{0,63}$'),
    ADD COLUMN control_version bigint NOT NULL DEFAULT 0 CHECK (control_version >= 0),
    ADD CONSTRAINT projects_suspension_pair_check CHECK ((suspended_at IS NULL) = (suspension_reason IS NULL));

CREATE TABLE project_control_actions (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    action text NOT NULL CHECK (action IN ('suspend', 'resume')),
    reason text NOT NULL CHECK (reason ~ '^[a-z][a-z0-9_]{0,63}$'),
    operator_label text NOT NULL CHECK (operator_label ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$'),
    control_version bigint NOT NULL CHECK (control_version > 0),
    created_at timestamptz NOT NULL,
    UNIQUE (project_id, control_version)
);

-- One durable bucket per project, shared by all credentials and API replicas.
-- Rejected requests don't append rows or change the token balance.
CREATE TABLE project_request_budgets (
    project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    available_tokens double precision NOT NULL CHECK (available_tokens BETWEEN 0 AND 1000000),
    refilled_at timestamptz NOT NULL
);

-- +goose Down
-- Refuse to silently re-enable suspended projects or discard operator audit.
LOCK TABLE projects, project_control_actions IN ACCESS EXCLUSIVE MODE;
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM projects WHERE suspended_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM project_control_actions) THEN
        RAISE EXCEPTION 'Project control state or audit exists; export and explicitly resolve it before rollback';
    END IF;
END;
$$;
-- +goose StatementEnd
DROP TABLE project_request_budgets;
DROP TABLE project_control_actions;
ALTER TABLE projects
    DROP CONSTRAINT projects_suspension_pair_check,
    DROP COLUMN control_version,
    DROP COLUMN suspension_reason,
    DROP COLUMN suspended_at;
