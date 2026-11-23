package store

import (
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/google/uuid"

	"cascadehook/internal/accounts"
	"cascadehook/internal/auth"
	"cascadehook/internal/deliveries"
	"cascadehook/internal/notifications"
	"cascadehook/internal/pagination"
	"cascadehook/internal/retention"
)

func TestProjectDetailsPermissionsAndAudit(t *testing.T) {
	f := newNotificationFixture(t)
	ctx := t.Context()
	details := accounts.ProjectDetails{Description: "Production order delivery", Environment: "production"}
	if err := f.db.SaveProjectDetails(ctx, f.member, f.project, details); !errors.Is(err, accounts.ErrForbidden) {
		t.Fatalf("member changed shared settings: %v", err)
	}
	if err := f.db.SaveProjectDetails(ctx, f.user, f.project, details); err != nil {
		t.Fatal(err)
	}
	project, err := f.db.RenameProject(ctx, f.user, f.project, "Orders")
	if err != nil || project.Description != details.Description || project.Environment != details.Environment {
		t.Fatalf("rename lost metadata: %+v, %v", project, err)
	}
	projects, err := f.db.ListProjects(ctx, f.user, f.org, pagination.Options{Limit: 20})
	if err != nil || len(projects) != 1 || projects[0].Environment != "production" {
		t.Fatalf("list omitted metadata: %+v, %v", projects, err)
	}
	entries, err := f.db.ListAuditEntries(ctx, f.user, f.org, &f.project, pagination.Options{Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	matched := false
	for _, entry := range entries {
		if slices.Contains(entry.ChangedFields, "description") && entry.ActorUserID != nil && *entry.ActorUserID == f.user {
			matched = true
		}
	}
	if !matched {
		t.Fatal("project change was not attributed in audit history")
	}
	if _, err := f.db.ListAuditEntries(ctx, f.member, f.org, nil, pagination.Options{Limit: 20}); !errors.Is(err, accounts.ErrForbidden) {
		t.Fatalf("member read restricted audit history: %v", err)
	}
	if _, err := f.db.ListAuditEntries(ctx, f.outsider, f.org, nil, pagination.Options{Limit: 20}); !errors.Is(err, accounts.ErrNotFound) {
		t.Fatalf("outsider read audit history: %v", err)
	}
	// Transaction-local actor context must not leak to a later system mutation.
	if _, err := f.db.pool.Exec(ctx, `UPDATE projects SET description='System change' WHERE id=$1`, f.project); err != nil {
		t.Fatal(err)
	}
	var actor *uuid.UUID
	if err := f.db.pool.QueryRow(ctx, `SELECT actor_user_id FROM audit_entries WHERE target_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1`, f.project).Scan(&actor); err != nil || actor != nil {
		t.Fatalf("actor context escaped its transaction: %v, %v", actor, err)
	}
}

func TestDeliveryCyclesSnapshotPolicyAndReplayUsesNewDefaults(t *testing.T) {
	f := newNotificationFixture(t)
	ctx := t.Context()
	policy := deliveries.Policy{MaxAttempts: 2, TimeoutSeconds: 4, RetryDelaysSeconds: []int{2, 4, 8, 16, 32, 64, 128}}
	if err := f.db.SaveDeliveryPolicy(ctx, f.member, f.project, policy); !errors.Is(err, accounts.ErrForbidden) {
		t.Fatalf("member changed policy: %v", err)
	}
	if err := f.db.SaveDeliveryPolicy(ctx, f.user, f.project, policy); err != nil {
		t.Fatal(err)
	}
	endpointID, eventID := uuid.New(), uuid.New()
	_, err := f.db.pool.Exec(ctx, `INSERT INTO endpoints(id,project_id,url,enabled,verified_at,signing_secret,signing_secret_updated_at)
		VALUES($1,$2,'https://receiver.example.test',true,clock_timestamp(),$3,clock_timestamp())`, endpointID, f.project, make([]byte, 61))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.pool.Exec(ctx, `INSERT INTO endpoint_subscriptions(endpoint_id,event_type) VALUES($1,'order.created')`, endpointID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.pool.Exec(ctx, `INSERT INTO events(id,project_id,event_type,payload,request_hash) VALUES($1,$2,'order.created',$3,$4)`, eventID, f.project, []byte(`{}`), make([]byte, 32)); err != nil {
		t.Fatal(err)
	}
	tx, err := f.db.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if count, err := fanOutEvent(ctx, tx, f.project, eventID, "order.created"); err != nil || count != 1 {
		rollbackTransaction(tx)
		t.Fatalf("fan out: %d, %v", count, err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	ownerID := uuid.New()
	claim := func() deliveries.Job {
		t.Helper()
		jobs, err := f.db.ClaimDeliveries(ctx, ownerID, 10, []uuid.UUID{})
		if err != nil || len(jobs) != 1 {
			t.Fatalf("claim: %+v, %v", jobs, err)
		}
		return jobs[0]
	}
	job := claim()
	first, err := f.db.BeginDeliveryAttempt(ctx, job)
	if err != nil || first.Timeout != 4*time.Second || !slices.Equal(first.RetryDelaysSeconds, policy.RetryDelaysSeconds) {
		t.Fatalf("attempt ignored policy: %+v, %v", first, err)
	}
	newPolicy := deliveries.DefaultPolicy()
	newPolicy.MaxAttempts = 1
	newPolicy.TimeoutSeconds = 7
	if err := f.db.SaveDeliveryPolicy(ctx, f.user, f.project, newPolicy); err != nil {
		t.Fatal(err)
	}
	completion, err := f.db.CompleteDelivery(ctx, first, deliveries.Result{Outcome: deliveries.OutcomeRetryable, StatusCode: 500, RetryDelay: 2 * time.Second})
	if err != nil || completion.State != deliveries.Pending {
		t.Fatalf("new policy changed an existing cycle: %+v, %v", completion, err)
	}
	if _, err := f.db.pool.Exec(ctx, `UPDATE deliveries SET next_attempt_at=clock_timestamp() WHERE id=$1`, job.DeliveryID); err != nil {
		t.Fatal(err)
	}
	second, err := f.db.BeginDeliveryAttempt(ctx, claim())
	if err != nil || second.Number != 2 || second.Timeout != 4*time.Second {
		t.Fatalf("second attempt changed snapshot: %+v, %v", second, err)
	}
	completion, err = f.db.CompleteDelivery(ctx, second, deliveries.Result{Outcome: deliveries.OutcomeRetryable, StatusCode: 500, RetryDelay: 2 * time.Second})
	if err != nil || completion.State != deliveries.Failed || completion.TerminalReason != "max_attempts" {
		t.Fatalf("custom attempt limit not enforced: %+v, %v", completion, err)
	}
	if _, err := f.db.ReplayDelivery(ctx, auth.Principal{ProjectID: f.project, UserID: f.user}, job.DeliveryID, 0); err != nil {
		t.Fatal(err)
	}
	replayed, err := f.db.BeginDeliveryAttempt(ctx, claim())
	if err != nil || replayed.Cycle != 1 || replayed.Timeout != 7*time.Second {
		t.Fatalf("replay ignored new policy: %+v, %v", replayed, err)
	}
	completion, err = f.db.CompleteDelivery(ctx, replayed, deliveries.Result{Outcome: deliveries.OutcomeRetryable, StatusCode: 500, RetryDelay: time.Second})
	if err != nil || completion.State != deliveries.Failed {
		t.Fatalf("replay ignored new attempt limit: %+v, %v", completion, err)
	}
	if _, err := f.db.pool.Exec(ctx, `UPDATE deliveries SET state='pending',terminal_reason=NULL WHERE id=$1`, job.DeliveryID); err != nil {
		t.Fatal(err)
	}
	if expired, err := f.db.ExpirePendingDeliveries(ctx, 10); err != nil || expired != 1 {
		t.Fatalf("pending exhaustion ignored custom policy: %d, %v", expired, err)
	}
}

func TestOrganizationMuteSeverityAndExplicitTestEmail(t *testing.T) {
	f := newNotificationFixture(t)
	ctx := t.Context()
	preferences := notifications.DefaultPreferences()
	preferences.EmailEnabled = true
	preferences.EmailSeverities = []string{"error"}
	if err := f.db.SaveNotificationPreferences(ctx, f.user, preferences); err != nil {
		t.Fatal(err)
	}
	f.emit(t, notifications.Delivery) // fixture severity is warning
	if job, err := f.db.ClaimEmail(ctx, 100); err != nil || job != nil {
		t.Fatalf("severity filter ignored: %+v, %v", job, err)
	}
	preferences.EmailSeverities = []string{"warning"}
	if err := f.db.SaveNotificationPreferences(ctx, f.user, preferences); err != nil {
		t.Fatal(err)
	}
	if err := f.db.SaveOrganizationNotificationPreferences(ctx, f.user, f.org, notifications.ProjectPreferences{EmailEnabled: false}); err != nil {
		t.Fatal(err)
	}
	f.emit(t, notifications.Delivery)
	if job, err := f.db.ClaimEmail(ctx, 100); err != nil || job != nil {
		t.Fatalf("organization mute ignored: %+v, %v", job, err)
	}
	test, err := f.db.QueueTestEmail(ctx, f.user, f.org)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.QueueTestEmail(ctx, f.user, f.org); !errors.Is(err, ErrEmailTestRateLimited) {
		t.Fatalf("test email rate limit ignored: %v", err)
	}
	if _, err := f.db.TestEmailStatus(ctx, f.member, f.org, test.ID); !errors.Is(err, accounts.ErrNotFound) {
		t.Fatalf("another member read email status: %v", err)
	}
	job, err := f.db.ClaimEmail(ctx, 100)
	if err != nil || job == nil || job.ID != test.ID {
		t.Fatalf("explicit test could not run while muted: %+v, %v", job, err)
	}
	if active, err := f.db.EmailActive(ctx, *job); err != nil || !active {
		t.Fatalf("test inactive: %v, %v", active, err)
	}
	if _, err := f.db.QueueTestEmail(ctx, f.outsider, f.org); !errors.Is(err, accounts.ErrNotFound) {
		t.Fatalf("outsider queued email: %v", err)
	}
}

func TestRetentionPolicyReportsActualJanitorConfiguration(t *testing.T) {
	f := newNotificationFixture(t)
	ctx := t.Context()
	before, err := f.db.RetentionPolicy(ctx)
	if err != nil || before.ReportedAt != nil || before.HistoryDays != nil {
		t.Fatalf("unreported policy guessed defaults: %+v, %v", before, err)
	}
	cfg := retention.Defaults()
	cfg.Days = 14
	cfg.NotificationDays = 45
	if err := f.db.RecordRetentionPolicy(ctx, cfg); err != nil {
		t.Fatal(err)
	}
	after, err := f.db.RetentionPolicy(ctx)
	if err != nil || after.HistoryDays == nil || *after.HistoryDays != 14 || after.NotificationDays == nil || *after.NotificationDays != 45 || after.ReportedAt == nil {
		t.Fatalf("reported policy incorrect: %+v, %v", after, err)
	}
}
