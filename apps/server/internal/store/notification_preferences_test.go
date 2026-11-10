package store

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"cascadehook/internal/accounts"
	"cascadehook/internal/mailoutbox"
	"cascadehook/internal/notifications"
	"cascadehook/migrations"
)

// Every fixture uses its own schema in an explicitly configured test database.
func notificationTestStore(t *testing.T) *Store {
	t.Helper()
	databaseURL := os.Getenv("CASCADEHOOK_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set CASCADEHOOK_TEST_DATABASE_URL to run notification persistence tests")
	}
	ctx := t.Context()
	admin, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	schemaName := "notification_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	schema := pgx.Identifier{schemaName}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE")
		_ = admin.Close(context.Background())
	})
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schemaName
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer rollbackTransaction(tx)
	entries, err := fs.ReadDir(migrations.FS, ".")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		contents, err := migrations.FS.ReadFile(entry.Name())
		if err != nil {
			t.Fatal(err)
		}
		up, _, _ := strings.Cut(string(contents), "-- +goose Down")
		if _, err := tx.Exec(ctx, up); err != nil {
			t.Fatalf("migration %s: %v", entry.Name(), err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	return &Store{pool: pool}
}

type notificationFixture struct {
	db                                   *Store
	user, member, outsider, org, project uuid.UUID
}

func newNotificationFixture(t *testing.T) notificationFixture {
	t.Helper()
	f := notificationFixture{
		db: notificationTestStore(t), user: uuid.New(), member: uuid.New(), outsider: uuid.New(),
		org: uuid.New(), project: uuid.New(),
	}
	queries := []struct {
		sql  string
		args []any
	}{
		{sql: `INSERT INTO users(id,identity_issuer,identity_subject) VALUES
			($1,'https://test.clerk.accounts.dev','user_owner'),
			($2,'https://test.clerk.accounts.dev','user_member'),
			($3,'https://test.clerk.accounts.dev','user_outsider')`, args: []any{f.user, f.member, f.outsider}},
		{sql: `INSERT INTO organizations(id,name) VALUES($1,'Test organization')`, args: []any{f.org}},
		{sql: `INSERT INTO memberships(organization_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'member')`,
			args: []any{f.org, f.user, f.member}},
		{sql: `INSERT INTO projects(id,organization_id,name) VALUES($1,$2,'Test project')`, args: []any{f.project, f.org}},
	}
	for _, query := range queries {
		if _, err := f.db.pool.Exec(t.Context(), query.sql, query.args...); err != nil {
			t.Fatal(err)
		}
	}
	return f
}

func (f notificationFixture) emit(t *testing.T, category notifications.Category) uuid.UUID {
	t.Helper()
	tx, err := f.db.pool.Begin(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	defer rollbackTransaction(tx)
	id, err := emitNotification(t.Context(), tx, notificationEvent{
		OrganizationID: f.org, ProjectID: f.project, Type: "test_update", Category: category,
		Severity: "warning", Title: "An update", Body: "Safe notification content.",
		ResourceType: "project", ResourceID: f.project, Audience: "manager",
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(t.Context()); err != nil {
		t.Fatal(err)
	}
	return id
}

func TestNotificationPreferencesAndEnqueue(t *testing.T) {
	f := newNotificationFixture(t)
	ctx := t.Context()
	preferences, err := f.db.NotificationPreferences(ctx, f.user)
	if err != nil || preferences.EmailEnabled || len(preferences.EmailCategories) != 6 {
		t.Fatalf("default preferences: %+v, %v", preferences, err)
	}
	f.emit(t, notifications.Delivery)
	preferences = notifications.Preferences{EmailEnabled: true, EmailCategories: []notifications.Category{notifications.Delivery}}
	if err := f.db.SaveNotificationPreferences(ctx, f.user, preferences); err != nil {
		t.Fatal(err)
	}
	// Enabling email must not enqueue an old inbox notification.
	if job, err := f.db.ClaimEmail(ctx, 100); err != nil || job != nil {
		t.Fatalf("unexpected historical email: %+v, %v", job, err)
	}
	f.emit(t, notifications.Credentials)
	if job, err := f.db.ClaimEmail(ctx, 100); err != nil || job != nil {
		t.Fatalf("unselected category queued: %+v, %v", job, err)
	}
	muted := notifications.ProjectPreferences{EmailEnabled: false}
	if err := f.db.SaveProjectNotificationPreferences(ctx, f.user, f.project, muted); err != nil {
		t.Fatal(err)
	}
	f.emit(t, notifications.Delivery)
	if job, err := f.db.ClaimEmail(ctx, 100); err != nil || job != nil {
		t.Fatalf("muted project queued: %+v, %v", job, err)
	}
	if err := f.db.SaveProjectNotificationPreferences(ctx, f.user, f.project,
		notifications.ProjectPreferences{EmailEnabled: true}); err != nil {
		t.Fatal(err)
	}
	id := f.emit(t, notifications.Delivery)
	job, err := f.db.ClaimEmail(ctx, 100)
	if err != nil || job == nil || job.NotificationID != id || job.RecipientSubject != "user_owner" {
		t.Fatalf("new alert was not claimed: %+v, %v", job, err)
	}
	if err := f.db.SaveEmailPayload(ctx, *job, []byte("encrypted-test-payload"), ""); err != nil {
		t.Fatal(err)
	}
	if err := f.db.FinishEmail(ctx, *job, mailoutbox.Completion{ErrorCode: "email_rejected"}); err != nil {
		t.Fatal(err)
	}
	if err := f.db.ApplyEmailEvent(ctx, mailoutbox.Event{
		JobID: job.ID, ID: "evt_notification_bounce", MessageID: "msg_notification_bounce",
		State: "bounced", OccurredAt: job.FirstAttemptAt,
	}); err != nil {
		t.Fatal(err)
	}
	var failures int
	if err := f.db.pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE type='invitation_email_failed'`).Scan(&failures); err != nil || failures != 0 {
		t.Fatalf("notification email failure emitted an invitation alert: %d, %v", failures, err)
	}
	other, err := f.db.NotificationPreferences(ctx, f.member)
	if err != nil || other.EmailEnabled {
		t.Fatalf("another member's preferences changed: %+v, %v", other, err)
	}
	// Every member may change their own preference; non-members may not.
	if err := f.db.SaveProjectNotificationPreferences(ctx, f.member, f.project, muted); err != nil {
		t.Fatalf("member could not change personal preference: %v", err)
	}
	if err := f.db.SaveProjectNotificationPreferences(ctx, f.outsider, f.project, muted); !errors.Is(err, accounts.ErrNotFound) {
		t.Fatalf("outsider updated project preferences: %v", err)
	}
}

func TestNotificationEmailRecipientCleanupAndRollback(t *testing.T) {
	f := newNotificationFixture(t)
	ctx := t.Context()
	preferences := notifications.DefaultPreferences()
	preferences.EmailEnabled = true
	if err := f.db.SaveNotificationPreferences(ctx, f.user, preferences); err != nil {
		t.Fatal(err)
	}
	id := f.emit(t, notifications.Delivery)
	contents, err := migrations.FS.ReadFile("00025_add_notification_preferences.sql")
	if err != nil {
		t.Fatal(err)
	}
	_, down, _ := strings.Cut(string(contents), "-- +goose Down")
	tx, err := f.db.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	_, rollbackErr := tx.Exec(ctx, down)
	rollbackTransaction(tx)
	if rollbackErr == nil || !strings.Contains(rollbackErr.Error(), "requires explicit cleanup") {
		t.Fatalf("rollback discarded queued email state: %v", rollbackErr)
	}
	if _, err := f.db.pool.Exec(ctx, `DELETE FROM notification_recipients WHERE notification_id=$1 AND user_id=$2`,
		id, f.user); err != nil {
		t.Fatal(err)
	}
	var remaining int
	if err := f.db.pool.QueryRow(ctx, `SELECT count(*) FROM email_outbox WHERE notification_id=$1`, id).Scan(&remaining); err != nil || remaining != 0 {
		t.Fatalf("email survived recipient removal: %d, %v", remaining, err)
	}
	tx, err = f.db.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer rollbackTransaction(tx)
	if _, err := tx.Exec(ctx, down); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestNotificationEmailsDoNotConsumeInvitationQuota(t *testing.T) {
	f := newNotificationFixture(t)
	ctx := t.Context()
	preferences := notifications.DefaultPreferences()
	preferences.EmailEnabled = true
	if err := f.db.SaveNotificationPreferences(ctx, f.user, preferences); err != nil {
		t.Fatal(err)
	}
	for range 100 {
		f.emit(t, notifications.Delivery)
	}
	invitation := accounts.Invitation{
		ID: uuid.New(), OrganizationID: f.org, Email: "new-member@example.com",
		Role: accounts.Member, ExpiresAt: time.Now().Add(time.Hour),
	}
	tx, err := f.db.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer rollbackTransaction(tx)
	_, err = tx.Exec(ctx, `INSERT INTO organization_invitations
		(id,organization_id,email,role,token_hash,created_by_user_id,expires_at)
		VALUES($1,$2,$3,$4,$5,$6,$7)`,
		invitation.ID, invitation.OrganizationID, invitation.Email, invitation.Role, make([]byte, 32), f.user, invitation.ExpiresAt)
	if err != nil {
		t.Fatal(err)
	}
	if err := enqueueInvitationEmail(ctx, tx, f.user, invitation); err != nil {
		t.Fatalf("notification emails consumed the invitation quota: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	job, err := f.db.ClaimEmail(ctx, 1000)
	if err != nil || job == nil || job.InvitationID != invitation.ID {
		t.Fatalf("invitations did not take dispatch priority: %+v, %v", job, err)
	}
}

func TestQueuedNotificationEmailRechecksAccessAndPreferences(t *testing.T) {
	cases := []struct {
		name, mutation string
	}{
		{name: "global opt-out", mutation: `UPDATE notification_preferences SET email_enabled=false`},
		{name: "category opt-out", mutation: `UPDATE notification_preferences SET email_categories='{}'`},
		{name: "project mute", mutation: `INSERT INTO project_notification_preferences(user_id,project_id,email_enabled)
			SELECT m.user_id,p.id,false FROM memberships m JOIN projects p ON p.organization_id=m.organization_id`},
		{name: "role demotion", mutation: `UPDATE memberships SET role='member'`},
		{name: "membership generation", mutation: `UPDATE memberships SET created_at=created_at+interval '1 second'`},
		{name: "project deletion", mutation: `UPDATE projects SET deletion_requested_at=clock_timestamp(),
			deletion_requested_by_user_id=(SELECT user_id FROM memberships WHERE role='owner')`},
		{name: "organization deletion", mutation: `UPDATE organizations SET deletion_requested_at=clock_timestamp(),
			deletion_requested_by_user_id=(SELECT user_id FROM memberships WHERE role='owner')`},
		{name: "account deletion", mutation: `UPDATE users SET deletion_requested_at=clock_timestamp(),
			provider_delete_after=clock_timestamp()`},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			f := newNotificationFixture(t)
			preferences := notifications.DefaultPreferences()
			preferences.EmailEnabled = true
			if err := f.db.SaveNotificationPreferences(t.Context(), f.user, preferences); err != nil {
				t.Fatal(err)
			}
			f.emit(t, notifications.Delivery)
			job, err := f.db.ClaimEmail(t.Context(), 100)
			if err != nil || job == nil {
				t.Fatalf("claim: %+v, %v", job, err)
			}
			if active, err := f.db.EmailActive(t.Context(), *job); err != nil || !active {
				t.Fatalf("new email inactive: %v, %v", active, err)
			}
			if _, err := f.db.pool.Exec(t.Context(), item.mutation); err != nil {
				t.Fatal(err)
			}
			if active, err := f.db.EmailActive(t.Context(), *job); err != nil || active {
				t.Fatalf("email still active: %v, %v", active, err)
			}
			if err := f.db.CleanEmailOutbox(t.Context()); err != nil {
				t.Fatal(err)
			}
			var state string
			if err := f.db.pool.QueryRow(t.Context(), `SELECT state FROM email_outbox WHERE id=$1`, job.ID).Scan(&state); err != nil || state != "cancelled" {
				t.Fatalf("queued alert not cancelled: %s, %v", state, err)
			}
		})
	}
}
