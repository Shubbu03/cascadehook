-- +goose Up
-- Plan purchases, changes, cancellations, and payment problems notify owners and admins.
ALTER TABLE notifications DROP CONSTRAINT notifications_category_check,
 ADD CONSTRAINT notifications_category_check CHECK (category IN ('team','access','project','credentials','usage','delivery','billing'));
ALTER TABLE notifications DROP CONSTRAINT notifications_resource_type_check,
 ADD CONSTRAINT notifications_resource_type_check CHECK (resource_type IN ('members','project','api_key','endpoint','usage','billing'));
ALTER TABLE notification_preferences DROP CONSTRAINT notification_preferences_email_categories_check,
 ADD CONSTRAINT notification_preferences_email_categories_check
 CHECK (email_categories <@ ARRAY['delivery','credentials','usage','team','access','project','billing']::text[]);
ALTER TABLE notification_preferences ALTER COLUMN email_categories SET DEFAULT ARRAY['delivery','credentials','usage','team','access','project','billing'];
-- Billing emails confirm changes to what the organization pays for, so existing recipients get them too.
UPDATE notification_preferences SET email_categories = email_categories || 'billing'::text WHERE NOT ('billing' = ANY(email_categories));

-- +goose Down
DELETE FROM notification_recipients r USING notifications n
 WHERE n.id = r.notification_id AND n.organization_id = r.organization_id AND (n.category = 'billing' OR n.resource_type = 'billing');
DELETE FROM notifications WHERE category = 'billing' OR resource_type = 'billing';
UPDATE notification_preferences SET email_categories = array_remove(email_categories, 'billing');
ALTER TABLE notification_preferences ALTER COLUMN email_categories SET DEFAULT ARRAY['delivery','credentials','usage','team','access','project'];
ALTER TABLE notification_preferences DROP CONSTRAINT notification_preferences_email_categories_check,
 ADD CONSTRAINT notification_preferences_email_categories_check
 CHECK (email_categories <@ ARRAY['delivery','credentials','usage','team','access','project']::text[]);
ALTER TABLE notifications DROP CONSTRAINT notifications_resource_type_check,
 ADD CONSTRAINT notifications_resource_type_check CHECK (resource_type IN ('members','project','api_key','endpoint','usage'));
ALTER TABLE notifications DROP CONSTRAINT notifications_category_check,
 ADD CONSTRAINT notifications_category_check CHECK (category IN ('team','access','project','credentials','usage','delivery'));
