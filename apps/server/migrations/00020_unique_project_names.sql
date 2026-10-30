-- +goose Up
-- Match the Unicode whitespace trimmed by accounts.NormalizeName. Keep the
-- display name intact; only the uniqueness key is case insensitive.
-- +goose StatementBegin
CREATE FUNCTION project_name_key(project_name text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
    SELECT lower(btrim(project_name,
        U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000'));
$$;
-- +goose StatementEnd

-- Prevent a write between the duplicate check and index creation.
LOCK TABLE projects IN SHARE ROW EXCLUSIVE MODE;

-- Existing names are user data: report conflicts instead of renaming them.
-- +goose StatementBegin
DO $$
DECLARE
    conflicting_organization uuid;
    conflicting_projects uuid[];
BEGIN
    SELECT organization_id, array_agg(id ORDER BY created_at, id)
    INTO conflicting_organization, conflicting_projects
    FROM projects
    WHERE deletion_requested_at IS NULL
    GROUP BY organization_id, project_name_key(name)
    HAVING count(*) > 1
    ORDER BY organization_id, project_name_key(name)
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Duplicate project names in organization % (project IDs: %); rename them explicitly before applying migration 00020',
            conflicting_organization, array_to_string(conflicting_projects, ', ')
            USING ERRCODE = '23505',
                HINT = 'See apps/server/migrations/PROJECT_NAMES.md for the rollout steps.';
    END IF;
END;
$$;
-- +goose StatementEnd

CREATE UNIQUE INDEX projects_organization_name_key
    ON projects (organization_id, project_name_key(name))
    WHERE deletion_requested_at IS NULL;

-- +goose Down
DROP INDEX projects_organization_name_key;
DROP FUNCTION project_name_key(text);
