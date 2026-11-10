-- +goose Up
CREATE TABLE audit_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    project_id uuid,
    actor_user_id uuid,
    actor_api_key_id uuid,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    changed_fields text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX audit_entries_organization_page_idx ON audit_entries(organization_id,created_at DESC,id DESC);
CREATE INDEX audit_entries_project_page_idx ON audit_entries(project_id,created_at DESC,id DESC);
CREATE INDEX audit_entries_retention_idx ON audit_entries(created_at,id);

-- Persist only allowlisted field names. Values, addresses, secrets and payloads
-- never enter the audit table. Actor context is transaction-local, set by Go.
-- +goose StatementBegin
CREATE FUNCTION capture_settings_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    current_row jsonb;
    previous_row jsonb;
    organization uuid;
    project uuid;
    target uuid;
    field text;
    changed text[] := '{}';
    kind text := TG_ARGV[0];
BEGIN
    -- Background child cleanup holds no organization gate. It must not take a
    -- new parent FK lock or create fresh history while deleting retained rows.
    IF nullif(current_setting('cascadehook.actor_user_id',true),'') IS NULL
        AND nullif(current_setting('cascadehook.actor_api_key_id',true),'') IS NULL
        AND TG_TABLE_NAME NOT IN ('organizations','projects') THEN
        RETURN NULL;
    END IF;
    IF TG_OP='DELETE' THEN current_row:=to_jsonb(OLD); ELSE current_row:=to_jsonb(NEW); END IF;
    IF TG_OP='UPDATE' THEN
        previous_row:=to_jsonb(OLD);
        FOREACH field IN ARRAY string_to_array(TG_ARGV[1],',') LOOP
            IF current_row->field IS DISTINCT FROM previous_row->field THEN changed:=array_append(changed,field); END IF;
        END LOOP;
        IF cardinality(changed)=0 THEN RETURN NEW; END IF;
    END IF;
    IF TG_TABLE_NAME='organizations' THEN
        organization:=(current_row->>'id')::uuid;
    ELSIF TG_TABLE_NAME IN ('memberships','organization_invitations','projects') THEN
        organization:=(current_row->>'organization_id')::uuid;
        IF TG_TABLE_NAME='projects' THEN project:=(current_row->>'id')::uuid; END IF;
    ELSE
        project:=(current_row->>'project_id')::uuid;
        SELECT organization_id INTO organization FROM projects WHERE id=project;
    END IF;
    IF TG_TABLE_NAME<>'organizations' AND NOT EXISTS
        (SELECT 1 FROM organizations WHERE id=organization AND deletion_requested_at IS NULL) THEN
        RETURN NULL;
    END IF;
    IF TG_TABLE_NAME='memberships' THEN target:=(current_row->>'user_id')::uuid;
    ELSIF TG_TABLE_NAME='project_delivery_policies' THEN target:=project;
    ELSE target:=(current_row->>'id')::uuid; END IF;
    INSERT INTO audit_entries(organization_id,project_id,actor_user_id,actor_api_key_id,action,target_type,target_id,changed_fields)
    VALUES(organization,project,nullif(current_setting('cascadehook.actor_user_id',true),'')::uuid,
        nullif(current_setting('cascadehook.actor_api_key_id',true),'')::uuid,
        kind||CASE TG_OP WHEN 'INSERT' THEN '.created' WHEN 'DELETE' THEN '.removed' ELSE '.updated' END,
        kind,target,changed);
    RETURN NULL;
END $$;
-- +goose StatementEnd

CREATE TRIGGER audit_organization AFTER INSERT OR UPDATE ON organizations FOR EACH ROW
    EXECUTE FUNCTION capture_settings_audit('organization','name,deletion_requested_at');
CREATE TRIGGER audit_project AFTER INSERT OR UPDATE ON projects FOR EACH ROW
    EXECUTE FUNCTION capture_settings_audit('project','name,description,environment,deletion_requested_at,suspended_at');
CREATE TRIGGER audit_delivery_policy AFTER INSERT OR UPDATE ON project_delivery_policies FOR EACH ROW
    EXECUTE FUNCTION capture_settings_audit('delivery_policy','max_attempts,timeout_seconds,retry_delays_seconds');
CREATE TRIGGER audit_endpoint AFTER INSERT OR UPDATE ON endpoints FOR EACH ROW
    EXECUTE FUNCTION capture_settings_audit('endpoint','url,enabled,verified_at,deleted_at,verification_version,signing_secret');
CREATE TRIGGER audit_api_key AFTER INSERT OR UPDATE ON api_keys FOR EACH ROW
    EXECUTE FUNCTION capture_settings_audit('api_key','name,expires_at,revoked_at,revokes_at,rotated_to_id');
CREATE TRIGGER audit_membership AFTER INSERT OR UPDATE OR DELETE ON memberships FOR EACH ROW
    EXECUTE FUNCTION capture_settings_audit('membership','role');
CREATE TRIGGER audit_invitation AFTER INSERT OR UPDATE ON organization_invitations FOR EACH ROW
    EXECUTE FUNCTION capture_settings_audit('invitation','role,accepted_at,revoked_at');

-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM audit_entries) THEN
        RAISE EXCEPTION 'Audit history exists; rollback requires explicit cleanup';
    END IF;
END $$;
-- +goose StatementEnd
DROP TRIGGER audit_invitation ON organization_invitations;
DROP TRIGGER audit_membership ON memberships;
DROP TRIGGER audit_api_key ON api_keys;
DROP TRIGGER audit_endpoint ON endpoints;
DROP TRIGGER audit_delivery_policy ON project_delivery_policies;
DROP TRIGGER audit_project ON projects;
DROP TRIGGER audit_organization ON organizations;
DROP FUNCTION capture_settings_audit();
DROP TABLE audit_entries;
