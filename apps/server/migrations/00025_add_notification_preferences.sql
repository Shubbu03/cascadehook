-- +goose Up
CREATE TABLE notification_preferences (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_enabled boolean NOT NULL DEFAULT false,
    email_categories text[] NOT NULL DEFAULT ARRAY['delivery','credentials','usage','team','access','project'],
    CHECK (email_categories <@ ARRAY['delivery','credentials','usage','team','access','project']::text[])
);

-- A project preference is personal. Global opt-in and category choices still apply.
CREATE TABLE project_notification_preferences (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    email_enabled boolean NOT NULL DEFAULT true,
    PRIMARY KEY (user_id, project_id)
);

ALTER TABLE email_outbox ALTER COLUMN invitation_id DROP NOT NULL;
ALTER TABLE email_outbox ADD COLUMN notification_id uuid;
ALTER TABLE email_outbox ADD COLUMN recipient_user_id uuid;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_notification_recipient_fk
    FOREIGN KEY (notification_id, recipient_user_id)
    REFERENCES notification_recipients(notification_id, user_id) ON DELETE CASCADE;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_source_check CHECK (
    (invitation_id IS NOT NULL AND notification_id IS NULL AND recipient_user_id IS NULL) OR
    (invitation_id IS NULL AND notification_id IS NOT NULL AND recipient_user_id IS NOT NULL)
);
CREATE UNIQUE INDEX email_outbox_notification_recipient_idx ON email_outbox (notification_id, recipient_user_id)
    WHERE notification_id IS NOT NULL;

-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM email_outbox WHERE notification_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Notification email state exists; rollback requires explicit cleanup';
    END IF;
END $$;
-- +goose StatementEnd
ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_source_check;
ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_notification_recipient_fk;
DROP INDEX email_outbox_notification_recipient_idx;
ALTER TABLE email_outbox DROP COLUMN recipient_user_id, DROP COLUMN notification_id;
ALTER TABLE email_outbox ALTER COLUMN invitation_id SET NOT NULL;
DROP TABLE project_notification_preferences;
DROP TABLE notification_preferences;
