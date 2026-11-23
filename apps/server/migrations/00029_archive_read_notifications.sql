-- +goose Up
-- Keep existing read history available in the archive under the new inbox flow.
UPDATE notification_recipients SET archived_at = read_at
WHERE read_at IS NOT NULL AND archived_at IS NULL;
UPDATE notification_recipients SET read_at = archived_at
WHERE archived_at IS NOT NULL AND read_at IS NULL;

ALTER TABLE notification_recipients ADD CONSTRAINT notification_recipients_read_archive_check
    CHECK ((read_at IS NULL) = (archived_at IS NULL));

-- +goose Down
ALTER TABLE notification_recipients DROP CONSTRAINT notification_recipients_read_archive_check;
-- Preserve personal history: rolling back the constraint does not unarchive it.
