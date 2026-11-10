package store

import (
	"strings"
	"testing"
	"time"

	"cascadehook/internal/notifications"
	"cascadehook/internal/pagination"
	"cascadehook/migrations"
)

func TestMarkNotificationReadArchivesAndRestoreMakesUnread(t *testing.T) {
	f := newNotificationFixture(t)
	ctx := t.Context()
	if _, err := f.db.pool.Exec(ctx, `UPDATE memberships SET role='owner' WHERE user_id=$1`, f.member); err != nil {
		t.Fatal(err)
	}
	id := f.emit(t, notifications.Delivery)
	read := true
	item, err := f.db.UpdateNotification(ctx, f.user, f.org, id, notifications.Update{Read: &read})
	if err != nil || item.ReadAt == nil || item.ArchivedAt == nil {
		t.Fatalf("read did not archive: %+v, %v", item, err)
	}
	for _, state := range []notifications.State{notifications.All, notifications.Unread} {
		items, err := f.db.ListNotifications(ctx, f.user, f.org, notifications.ListOptions{
			Options: pagination.Options{Limit: 20}, Filters: notifications.Filters{State: state},
		})
		if err != nil || len(items) != 0 {
			t.Fatalf("read item remained in %s: %+v, %v", state, items, err)
		}
	}
	archived, err := f.db.ListNotifications(ctx, f.user, f.org, notifications.ListOptions{
		Options: pagination.Options{Limit: 20}, Filters: notifications.Filters{State: notifications.Archived},
	})
	if err != nil || len(archived) != 1 || archived[0].ID != id {
		t.Fatalf("read item missing from archive: %+v, %v", archived, err)
	}
	count, err := f.db.NotificationUnreadCount(ctx, f.user, f.org, notifications.Filters{})
	if err != nil || count != 0 {
		t.Fatalf("read item counted as unread: %d, %v", count, err)
	}
	count, err = f.db.NotificationUnreadCount(ctx, f.member, f.org, notifications.Filters{})
	if err != nil || count != 1 {
		t.Fatalf("another recipient's state changed: %d, %v", count, err)
	}
	again, err := f.db.UpdateNotification(ctx, f.user, f.org, id, notifications.Update{Read: &read})
	if err != nil || !again.ReadAt.Equal(*item.ReadAt) || !again.ArchivedAt.Equal(*item.ArchivedAt) {
		t.Fatalf("repeated read changed timestamps: %+v, %v", again, err)
	}
	read = false
	restored, err := f.db.UpdateNotification(ctx, f.user, f.org, id, notifications.Update{Read: &read})
	if err != nil || restored.ReadAt != nil || restored.ArchivedAt != nil {
		t.Fatalf("restored item is not unread in inbox: %+v, %v", restored, err)
	}
	count, err = f.db.NotificationUnreadCount(ctx, f.user, f.org, notifications.Filters{})
	if err != nil || count != 1 {
		t.Fatalf("restored item not counted: %d, %v", count, err)
	}
	// Existing API clients using the archive field must follow the same flow.
	read = true
	item, err = f.db.UpdateNotification(ctx, f.user, f.org, id, notifications.Update{Archived: &read})
	if err != nil || item.ReadAt == nil || item.ArchivedAt == nil {
		t.Fatalf("archive field did not mark read: %+v, %v", item, err)
	}
	read = false
	item, err = f.db.UpdateNotification(ctx, f.user, f.org, id, notifications.Update{Archived: &read})
	if err != nil || item.ReadAt != nil || item.ArchivedAt != nil {
		t.Fatalf("archive field did not restore unread: %+v, %v", item, err)
	}
}

func TestReadAllArchivesOnlyMatchingPersonalNotifications(t *testing.T) {
	f := newNotificationFixture(t)
	ctx := t.Context()
	f.emit(t, notifications.Delivery)
	f.emit(t, notifications.Usage)
	filters := notifications.Filters{Category: notifications.Delivery, ProjectID: &f.project}
	updated, err := f.db.ReadAllNotifications(ctx, f.user, f.org, filters)
	if err != nil || updated != 1 {
		t.Fatalf("filtered read-all: %d, %v", updated, err)
	}
	updated, err = f.db.ReadAllNotifications(ctx, f.user, f.org, filters)
	if err != nil || updated != 0 {
		t.Fatalf("read-all was not idempotent: %d, %v", updated, err)
	}
	count, err := f.db.NotificationUnreadCount(ctx, f.user, f.org, notifications.Filters{})
	if err != nil || count != 1 {
		t.Fatalf("unrelated unread item changed: %d, %v", count, err)
	}
	items, err := f.db.ListNotifications(ctx, f.user, f.org, notifications.ListOptions{
		Options: pagination.Options{Limit: 20}, Filters: notifications.Filters{State: notifications.Archived},
	})
	if err != nil || len(items) != 1 || items[0].Category != notifications.Delivery || items[0].ReadAt == nil {
		t.Fatalf("read-all item missing from archive: %+v, %v", items, err)
	}
}

func TestArchiveReadMigrationPreservesExistingHistory(t *testing.T) {
	f := newNotificationFixture(t)
	ctx := t.Context()
	readID := f.emit(t, notifications.Delivery)
	archivedID := f.emit(t, notifications.Usage)
	unreadID := f.emit(t, notifications.Team)
	tx, err := f.db.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer rollbackTransaction(tx)
	if _, err := tx.Exec(ctx, `ALTER TABLE notification_recipients DROP CONSTRAINT notification_recipients_read_archive_check`); err != nil {
		t.Fatal(err)
	}
	stamp := time.Date(2026, 11, 9, 10, 0, 0, 0, time.UTC)
	if _, err := tx.Exec(ctx, `UPDATE notification_recipients SET read_at=$2 WHERE notification_id=$1`, readID, stamp); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `UPDATE notification_recipients SET archived_at=$2 WHERE notification_id=$1`, archivedID, stamp); err != nil {
		t.Fatal(err)
	}
	contents, err := migrations.FS.ReadFile("00029_archive_read_notifications.sql")
	if err != nil {
		t.Fatal(err)
	}
	up, _, _ := strings.Cut(string(contents), "-- +goose Down")
	if _, err := tx.Exec(ctx, up); err != nil {
		t.Fatal(err)
	}
	var preserved, pending int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM notification_recipients
		WHERE notification_id IN ($1,$2) AND read_at=$3 AND archived_at=$3`, readID, archivedID, stamp).Scan(&preserved); err != nil || preserved != 2 {
		t.Fatalf("existing history changed or lost: %d, %v", preserved, err)
	}
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM notification_recipients
		WHERE notification_id=$1 AND read_at IS NULL AND archived_at IS NULL`, unreadID).Scan(&pending); err != nil || pending != 1 {
		t.Fatalf("migration changed unread history: %d, %v", pending, err)
	}
}
