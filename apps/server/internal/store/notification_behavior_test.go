package store

import (
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"cascadehook/internal/accounts"
	"cascadehook/internal/auth"
	"cascadehook/internal/deliveries"
	"cascadehook/internal/mailoutbox"
	"cascadehook/internal/notifications"
	"cascadehook/internal/pagination"
	"cascadehook/migrations"
)

func TestProjectNotificationsRecipientsAndIdempotentRename(t *testing.T) {
	f := newNotificationFixture(t)
	ctx := t.Context()
	adminID := uuid.New()
	if _, err := f.db.pool.Exec(ctx, `INSERT INTO users(id,identity_issuer,identity_subject)
		VALUES($1,'https://test.clerk.accounts.dev','user_admin')`, adminID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.pool.Exec(ctx, `INSERT INTO memberships(organization_id,user_id,role)
		VALUES($1,$2,'admin')`, f.org, adminID); err != nil {
		t.Fatal(err)
	}
	preferences := notifications.DefaultPreferences()
	preferences.EmailEnabled = true
	preferences.EmailCategories = []notifications.Category{notifications.Project}
	for _, userID := range []uuid.UUID{f.user, adminID, f.member, f.outsider} {
		if err := f.db.SaveNotificationPreferences(ctx, userID, preferences); err != nil {
			t.Fatal(err)
		}
	}
	project, err := f.db.CreateProject(ctx, f.user, CreateProjectParams{OrganizationID: f.org, Name: "Payments"})
	if err != nil {
		t.Fatal(err)
	}
	renamed, err := f.db.RenameProject(ctx, f.user, project.ID, "Orders")
	if err != nil {
		t.Fatal(err)
	}
	unchanged, err := f.db.RenameProject(ctx, f.user, project.ID, "  Orders  ")
	if err != nil || !unchanged.UpdatedAt.Equal(renamed.UpdatedAt) {
		t.Fatalf("unchanged rename wrote a new change: %+v, %v", unchanged, err)
	}
	var group sync.WaitGroup
	errorResults := make(chan error, 4)
	for range 4 {
		group.Go(func() {
			_, err := f.db.RenameProject(ctx, f.user, project.ID, "Fulfilment")
			errorResults <- err
		})
	}
	group.Wait()
	close(errorResults)
	for err := range errorResults {
		if err != nil {
			t.Fatal(err)
		}
	}
	items, err := f.db.ListNotifications(ctx, adminID, f.org, notifications.ListOptions{
		Options: pagination.Options{Limit: 20}, Filters: notifications.Filters{State: notifications.All, ProjectID: &project.ID},
	})
	if err != nil || len(items) != 3 {
		t.Fatalf("expected one creation and two real renames: %+v, %v", items, err)
	}
	if items[2].Type != "project_created" || items[0].Type != "project_renamed" || !strings.Contains(items[1].Body, "Payments") {
		t.Fatalf("project notification content: %+v", items)
	}
	for _, item := range items {
		if item.Category != notifications.Project || item.Severity != "info" || item.Target.ID == nil || *item.Target.ID != project.ID {
			t.Fatalf("project notification metadata: %+v", item)
		}
	}
	for _, userID := range []uuid.UUID{f.user, f.member, f.outsider} {
		var count int
		if err := f.db.pool.QueryRow(ctx, `SELECT count(*) FROM notification_recipients r
			JOIN notifications n ON n.id=r.notification_id WHERE n.project_id=$1 AND r.user_id=$2`, project.ID, userID).Scan(&count); err != nil || count != 0 {
			t.Fatalf("actor/member/outsider unexpectedly received a project alert: %d, %v", count, err)
		}
	}
	var emails int
	if err := f.db.pool.QueryRow(ctx, `SELECT count(*) FROM email_outbox e JOIN notifications n ON n.id=e.notification_id
		WHERE n.project_id=$1 AND e.recipient_user_id=$2`, project.ID, adminID).Scan(&emails); err != nil || emails != 0 {
		t.Fatalf("routine project updates queued email: %d, %v", emails, err)
	}
	if _, err := f.db.RenameProject(ctx, f.member, project.ID, "Forbidden"); !errors.Is(err, accounts.ErrForbidden) {
		t.Fatalf("member could rename a project: %v", err)
	}
	if _, err := f.db.CreateProject(ctx, f.user, CreateProjectParams{OrganizationID: f.org, Name: "Fulfilment"}); !errors.Is(err, accounts.ErrProjectNameTaken) {
		t.Fatalf("duplicate project creation succeeded: %v", err)
	}
}

func TestRoutineProjectEmailsAlreadyQueuedAreBlocked(t *testing.T) {
	for _, eventType := range []string{"project_created", "project_renamed"} {
		t.Run(eventType, func(t *testing.T) {
			f := newNotificationFixture(t)
			ctx := t.Context()
			preferences := notifications.DefaultPreferences()
			preferences.EmailEnabled = true
			if err := f.db.SaveNotificationPreferences(ctx, f.user, preferences); err != nil {
				t.Fatal(err)
			}
			tx, err := f.db.pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer rollbackTransaction(tx)
			id, err := emitNotification(ctx, tx, notificationEvent{
				OrganizationID: f.org, ProjectID: f.project, Type: eventType,
				Category: notifications.Project, Severity: "info", Title: "Project updated",
				Body: "A routine project update.", Audience: "manager",
				ResourceType: "project", ResourceID: f.project,
			})
			if err != nil {
				t.Fatal(err)
			}
			if err := tx.Commit(ctx); err != nil {
				t.Fatal(err)
			}
			// Simulate a job queued by the previous release. It must neither be
			// claimed nor sent if another worker had already leased it.
			jobID := uuid.New()
			if _, err := f.db.pool.Exec(ctx, `INSERT INTO email_outbox
				(id,organization_id,created_by_user_id,notification_id,recipient_user_id)
				VALUES($1,$2,$3,$4,$3)`, jobID, f.org, f.user, id); err != nil {
				t.Fatal(err)
			}
			if job, err := f.db.ClaimEmail(ctx, 100); err != nil || job != nil {
				t.Fatalf("routine update claimed: %+v, %v", job, err)
			}
			leaseID := uuid.New()
			if _, err := f.db.pool.Exec(ctx, `UPDATE email_outbox SET state='sending',
				lease_id=$2,leased_until=clock_timestamp()+interval '90 seconds',
				payload_ciphertext='encrypted-test-payload' WHERE id=$1`, jobID, leaseID); err != nil {
				t.Fatal(err)
			}
			job := mailoutbox.Job{ID: jobID, NotificationID: id, LeaseID: leaseID}
			if active, err := f.db.EmailActive(ctx, job); err != nil || active {
				t.Fatalf("routine update still eligible to send: %v, %v", active, err)
			}
			if err := f.db.CleanEmailOutbox(ctx); err != nil {
				t.Fatal(err)
			}
			var state string
			var cleared bool
			if err := f.db.pool.QueryRow(ctx, `SELECT state,
				payload_ciphertext IS NULL AND lease_id IS NULL AND leased_until IS NULL
				FROM email_outbox WHERE id=$1`, jobID).Scan(&state, &cleared); err != nil || state != "cancelled" || !cleared {
				t.Fatalf("routine update not cancelled and cleared: %s, %v, %v", state, cleared, err)
			}
		})
	}
}

type retryNotificationFixture struct {
	notificationFixture
	endpointID, deliveryID, workerID uuid.UUID
}

func newRetryNotificationFixture(t *testing.T) retryNotificationFixture {
	t.Helper()
	f := retryNotificationFixture{notificationFixture: newNotificationFixture(t), endpointID: uuid.New(), workerID: uuid.New()}
	_, err := f.db.pool.Exec(t.Context(), `INSERT INTO endpoints
		(id,project_id,url,enabled,verified_at,signing_secret,signing_secret_updated_at)
		VALUES($1,$2,'https://receiver.example.test',true,clock_timestamp(),$3,clock_timestamp())`, f.endpointID, f.project, make([]byte, 61))
	if err != nil {
		t.Fatal(err)
	}
	f.deliveryID = f.addDelivery(t)
	return f
}

func (f retryNotificationFixture) addDelivery(t *testing.T) uuid.UUID {
	t.Helper()
	eventID, deliveryID := uuid.New(), uuid.New()
	if _, err := f.db.pool.Exec(t.Context(), `INSERT INTO events(id,project_id,event_type,payload,request_hash)
		VALUES($1,$2,'order.created',$3,$4)`, eventID, f.project, []byte(`{}`), make([]byte, 32)); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.pool.Exec(t.Context(), `INSERT INTO deliveries(id,project_id,event_id,endpoint_id)
		VALUES($1,$2,$3,$4)`, deliveryID, f.project, eventID, f.endpointID); err != nil {
		t.Fatal(err)
	}
	return deliveryID
}

func (f retryNotificationFixture) nextAttempt(t *testing.T) deliveries.Attempt {
	t.Helper()
	if _, err := f.db.pool.Exec(t.Context(), `UPDATE deliveries SET next_attempt_at=clock_timestamp() WHERE id=$1`, f.deliveryID); err != nil {
		t.Fatal(err)
	}
	jobs, err := f.db.ClaimDeliveries(t.Context(), f.workerID, 10, []uuid.UUID{})
	if err != nil || len(jobs) != 1 {
		t.Fatalf("claim delivery: %+v, %v", jobs, err)
	}
	attempt, err := f.db.BeginDeliveryAttempt(t.Context(), jobs[0])
	if err != nil || attempt.ID == uuid.Nil {
		t.Fatalf("begin attempt: %+v, %v", attempt, err)
	}
	return attempt
}

func (f retryNotificationFixture) complete(t *testing.T, attempt deliveries.Attempt, result deliveries.Result) deliveries.Completion {
	t.Helper()
	completion, err := f.db.CompleteDelivery(t.Context(), attempt, result)
	if err != nil {
		t.Fatal(err)
	}
	return completion
}

func (f retryNotificationFixture) ageRetryWindow(t *testing.T) {
	t.Helper()
	if _, err := f.db.pool.Exec(t.Context(), `UPDATE notification_delivery_retry_state
		SET first_failure_at=clock_timestamp()-interval '6 minutes' WHERE endpoint_id=$1`, f.endpointID); err != nil {
		t.Fatal(err)
	}
}

func (f retryNotificationFixture) count(t *testing.T, kind string) int {
	t.Helper()
	var count int
	if err := f.db.pool.QueryRow(t.Context(), `SELECT count(*) FROM notifications WHERE project_id=$1 AND type=$2`, f.project, kind).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func TestRetryWarningDeduplicationEscalationAndRecovery(t *testing.T) {
	f := newRetryNotificationFixture(t)
	ctx := t.Context()
	preferences := notifications.DefaultPreferences()
	preferences.EmailEnabled = true
	if err := f.db.SaveNotificationPreferences(ctx, f.user, preferences); err != nil {
		t.Fatal(err)
	}
	retry := deliveries.Result{Outcome: deliveries.OutcomeRetryable, StatusCode: 503, RetryDelay: time.Hour}
	if result := f.complete(t, f.nextAttempt(t), retry); result.State != deliveries.Pending {
		t.Fatalf("retry ended too early: %+v", result)
	}
	if count, err := f.db.GenerateDeliveryRetryWarnings(ctx, 100); err != nil || count != 0 {
		t.Fatalf("transient failure warned immediately: %d, %v", count, err)
	}
	f.ageRetryWindow(t)
	var group sync.WaitGroup
	counts := make(chan int, 4)
	errorResults := make(chan error, 4)
	for range 4 {
		group.Go(func() {
			count, err := f.db.GenerateDeliveryRetryWarnings(ctx, 100)
			counts <- count
			errorResults <- err
		})
	}
	group.Wait()
	close(counts)
	close(errorResults)
	for err := range errorResults {
		if err != nil {
			t.Fatal(err)
		}
	}
	total := 0
	for count := range counts {
		total += count
	}
	if total != 1 || f.count(t, "delivery_retrying") != 1 {
		t.Fatalf("competing workers duplicated warnings: %d", total)
	}
	var state string
	var attempts int
	var remainsScheduled bool
	if err := f.db.pool.QueryRow(ctx, `SELECT state,attempt_count,next_attempt_at>clock_timestamp()
		FROM deliveries WHERE id=$1`, f.deliveryID).Scan(&state, &attempts, &remainsScheduled); err != nil || state != "pending" || attempts != 1 || !remainsScheduled {
		t.Fatalf("warning changed delivery scheduling: %s, %d, %v, %v", state, attempts, remainsScheduled, err)
	}
	f.complete(t, f.nextAttempt(t), retry)
	if count, err := f.db.GenerateDeliveryRetryWarnings(ctx, 100); err != nil || count != 0 {
		t.Fatalf("repeat failure duplicated warning: %d, %v", count, err)
	}
	f.complete(t, f.nextAttempt(t), deliveries.Result{Outcome: deliveries.OutcomeTerminal, StatusCode: 400})
	if f.count(t, "delivery_failed") != 1 {
		t.Fatal("early warning suppressed the final failure")
	}
	if _, err := f.db.ReplayDelivery(ctx, auth.Principal{ProjectID: f.project, UserID: f.user}, f.deliveryID, 0); err != nil {
		t.Fatal(err)
	}
	success := f.nextAttempt(t)
	f.complete(t, success, deliveries.Result{Outcome: deliveries.OutcomeSucceeded, StatusCode: 204})
	f.complete(t, success, deliveries.Result{Outcome: deliveries.OutcomeSucceeded, StatusCode: 204})
	if f.count(t, "delivery_recovered") != 1 {
		t.Fatal("warning/final failure did not share one idempotent recovery")
	}
	var resolved int
	if err := f.db.pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE project_id=$1
		AND type IN ('delivery_retrying','delivery_failed') AND resolved_at IS NOT NULL`, f.project).Scan(&resolved); err != nil || resolved != 2 {
		t.Fatalf("recovery did not close both alert levels: %d, %v", resolved, err)
	}
	var emails int
	if err := f.db.pool.QueryRow(ctx, `SELECT count(*) FROM email_outbox e JOIN notifications n ON n.id=e.notification_id
		WHERE n.project_id=$1`, f.project).Scan(&emails); err != nil || emails != 3 {
		t.Fatalf("warning/failure/recovery emails were not queued once each: %d, %v", emails, err)
	}
	if _, err := f.db.ReplayDelivery(ctx, auth.Principal{ProjectID: f.project, UserID: f.user}, f.deliveryID, 1); err != nil {
		t.Fatal(err)
	}
	f.complete(t, f.nextAttempt(t), retry)
	f.ageRetryWindow(t)
	if count, err := f.db.GenerateDeliveryRetryWarnings(ctx, 100); err != nil || count != 1 || f.count(t, "delivery_retrying") != 2 {
		t.Fatalf("new incident after recovery did not warn: %d, %v", count, err)
	}
}

func TestRetryWarningSuppression(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*testing.T, retryNotificationFixture)
	}{
		{name: "recovered before warning", mutate: func(t *testing.T, f retryNotificationFixture) {
			f.complete(t, f.nextAttempt(t), deliveries.Result{Outcome: deliveries.OutcomeSucceeded, StatusCode: 200})
		}},
		{name: "final failure before warning", mutate: func(t *testing.T, f retryNotificationFixture) {
			f.complete(t, f.nextAttempt(t), deliveries.Result{Outcome: deliveries.OutcomeTerminal, StatusCode: 400})
		}},
		{name: "disabled endpoint", mutate: func(t *testing.T, f retryNotificationFixture) {
			if _, err := f.db.pool.Exec(t.Context(), `UPDATE endpoints SET enabled=false WHERE id=$1`, f.endpointID); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "deleted endpoint", mutate: func(t *testing.T, f retryNotificationFixture) {
			if _, err := f.db.pool.Exec(t.Context(), `UPDATE endpoints SET enabled=false,deleted_at=clock_timestamp() WHERE id=$1`, f.endpointID); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "paused project", mutate: func(t *testing.T, f retryNotificationFixture) {
			if _, err := f.db.pool.Exec(t.Context(), `UPDATE projects SET suspended_at=clock_timestamp(),suspension_reason='maintenance' WHERE id=$1`, f.project); err != nil {
				t.Fatal(err)
			}
		}},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			f := newRetryNotificationFixture(t)
			f.complete(t, f.nextAttempt(t), deliveries.Result{Outcome: deliveries.OutcomeRetryable, StatusCode: 503, RetryDelay: time.Hour})
			f.ageRetryWindow(t)
			item.mutate(t, f)
			if count, err := f.db.GenerateDeliveryRetryWarnings(t.Context(), 100); err != nil || count != 0 {
				t.Fatalf("ineligible incident produced a warning: %d, %v", count, err)
			}
			if item.name == "recovered before warning" && f.count(t, "delivery_recovered") != 0 {
				t.Fatal("transient failure generated a recovery notification")
			}
		})
	}
}

func TestWarningRecoveryRequiresRequestAfterLatestFailure(t *testing.T) {
	f := newRetryNotificationFixture(t)
	otherID := f.addDelivery(t)
	jobs, err := f.db.ClaimDeliveries(t.Context(), f.workerID, 10, []uuid.UUID{})
	if err != nil || len(jobs) != 2 {
		t.Fatalf("claim concurrent deliveries: %+v, %v", jobs, err)
	}
	var olderSuccessJob, failureJob deliveries.Job
	for _, job := range jobs {
		if job.DeliveryID == otherID {
			olderSuccessJob = job
		} else {
			failureJob = job
		}
	}
	olderSuccess, err := f.db.BeginDeliveryAttempt(t.Context(), olderSuccessJob)
	if err != nil {
		t.Fatal(err)
	}
	failure, err := f.db.BeginDeliveryAttempt(t.Context(), failureJob)
	if err != nil {
		t.Fatal(err)
	}
	f.complete(t, failure, deliveries.Result{Outcome: deliveries.OutcomeRetryable, StatusCode: 503, RetryDelay: time.Hour})
	f.ageRetryWindow(t)
	if count, err := f.db.GenerateDeliveryRetryWarnings(t.Context(), 100); err != nil || count != 1 {
		t.Fatalf("missing warning: %d, %v", count, err)
	}
	f.complete(t, olderSuccess, deliveries.Result{Outcome: deliveries.OutcomeSucceeded, StatusCode: 200})
	if f.count(t, "delivery_recovered") != 0 {
		t.Fatal("old in-flight success incorrectly resolved a newer failure")
	}
	f.complete(t, f.nextAttempt(t), deliveries.Result{Outcome: deliveries.OutcomeSucceeded, StatusCode: 200})
	if f.count(t, "delivery_recovered") != 1 {
		t.Fatal("fresh success did not resolve retry warning")
	}
}

func TestRetryWarningIgnoresWorkerInterruptionAndHonorsEmailSeverity(t *testing.T) {
	f := newRetryNotificationFixture(t)
	f.complete(t, f.nextAttempt(t), deliveries.Result{Outcome: deliveries.OutcomeInterrupted, ErrorCode: "worker_shutdown"})
	var states int
	if err := f.db.pool.QueryRow(t.Context(), `SELECT count(*) FROM notification_delivery_retry_state`).Scan(&states); err != nil || states != 0 {
		t.Fatalf("worker interruption started receiver warning: %d, %v", states, err)
	}
	preferences := notifications.DefaultPreferences()
	preferences.EmailEnabled = true
	preferences.EmailSeverities = []string{"error"}
	if err := f.db.SaveNotificationPreferences(t.Context(), f.user, preferences); err != nil {
		t.Fatal(err)
	}
	f.complete(t, f.nextAttempt(t), deliveries.Result{Outcome: deliveries.OutcomeRetryable, StatusCode: 503, RetryDelay: time.Hour})
	f.ageRetryWindow(t)
	if count, err := f.db.GenerateDeliveryRetryWarnings(t.Context(), 100); err != nil || count != 1 {
		t.Fatalf("missing in-app warning: %d, %v", count, err)
	}
	var emails int
	if err := f.db.pool.QueryRow(t.Context(), `SELECT count(*) FROM email_outbox`).Scan(&emails); err != nil || emails != 0 {
		t.Fatalf("warning bypassed severity preference: %d, %v", emails, err)
	}
}

func TestRetryWarningStateCleanupAndRollback(t *testing.T) {
	f := newRetryNotificationFixture(t)
	f.complete(t, f.nextAttempt(t), deliveries.Result{Outcome: deliveries.OutcomeRetryable, StatusCode: 503, RetryDelay: time.Hour})
	contents, err := migrations.FS.ReadFile("00028_add_delivery_retry_warnings.sql")
	if err != nil {
		t.Fatal(err)
	}
	_, down, _ := strings.Cut(string(contents), "-- +goose Down")
	tx, err := f.db.pool.Begin(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	_, rollbackErr := tx.Exec(t.Context(), down)
	rollbackTransaction(tx)
	if rollbackErr == nil || !strings.Contains(rollbackErr.Error(), "requires explicit cleanup") {
		t.Fatalf("rollback discarded retry state: %v", rollbackErr)
	}
	if _, err := f.db.pool.Exec(t.Context(), `DELETE FROM endpoints WHERE id=$1`, f.endpointID); err != nil {
		t.Fatal(err)
	}
	var remaining int
	if err := f.db.pool.QueryRow(t.Context(), `SELECT count(*) FROM notification_delivery_retry_state`).Scan(&remaining); err != nil || remaining != 0 {
		t.Fatalf("endpoint cleanup left retry state: %d, %v", remaining, err)
	}
	if _, err := f.db.pool.Exec(t.Context(), down); err != nil {
		t.Fatal(err)
	}
}

func TestRetryWarningMigrationSeedsOnlyUnrecoveredRetries(t *testing.T) {
	for _, recovered := range []bool{false, true} {
		name := "pending retries"
		if recovered {
			name = "already recovered"
		}
		t.Run(name, func(t *testing.T) {
			f := newRetryNotificationFixture(t)
			f.complete(t, f.nextAttempt(t), deliveries.Result{Outcome: deliveries.OutcomeRetryable, StatusCode: 503, RetryDelay: time.Hour})
			if recovered {
				// Another delivery recovered the receiver while the original job
				// remains pending in backoff. Its old failure must not be seeded.
				f.addDelivery(t)
				jobs, err := f.db.ClaimDeliveries(t.Context(), f.workerID, 10, []uuid.UUID{})
				if err != nil || len(jobs) != 1 {
					t.Fatalf("claim recovery delivery: %+v, %v", jobs, err)
				}
				success, err := f.db.BeginDeliveryAttempt(t.Context(), jobs[0])
				if err != nil {
					t.Fatal(err)
				}
				f.complete(t, success, deliveries.Result{Outcome: deliveries.OutcomeSucceeded, StatusCode: 200})
			}
			if _, err := f.db.pool.Exec(t.Context(), `UPDATE delivery_attempts
				SET started_at=started_at-interval '6 minutes',finished_at=finished_at-interval '6 minutes'
				WHERE project_id=$1`, f.project); err != nil {
				t.Fatal(err)
			}
			if _, err := f.db.pool.Exec(t.Context(), `UPDATE deliveries SET
				created_at=created_at-interval '6 minutes',cycle_started_at=cycle_started_at-interval '6 minutes',
				retry_deadline=retry_deadline-interval '6 minutes',next_attempt_at=next_attempt_at-interval '6 minutes'
				WHERE project_id=$1`, f.project); err != nil {
				t.Fatal(err)
			}
			contents, err := migrations.FS.ReadFile("00028_add_delivery_retry_warnings.sql")
			if err != nil {
				t.Fatal(err)
			}
			up, _, _ := strings.Cut(string(contents), "-- +goose Down")
			// Recreate only the new table, leaving the pre-migration queue/history.
			if _, err := f.db.pool.Exec(t.Context(), `DROP TABLE notification_delivery_retry_state`); err != nil {
				t.Fatal(err)
			}
			if _, err := f.db.pool.Exec(t.Context(), up); err != nil {
				t.Fatal(err)
			}
			want := 1
			if recovered {
				want = 0
			}
			if count, err := f.db.GenerateDeliveryRetryWarnings(t.Context(), 100); err != nil || count != want {
				t.Fatalf("migration seeded the wrong retry incidents: %d, want %d, %v", count, want, err)
			}
		})
	}
}
