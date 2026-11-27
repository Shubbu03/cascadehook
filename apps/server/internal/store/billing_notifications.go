package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/billing"
	"cascadehook/internal/notifications"
)

// billingSnapshot is the part of an organization's billing state that customers are told about.
type billingSnapshot struct {
	Subscription string
	Plan         string
	Interval     string
	Status       string
	CancelAtEnd  bool
	Scheduled    string
	ScheduledAt  *time.Time
	PaidThrough  *time.Time
	AccessUntil  *time.Time
}

type billingNotice struct {
	Kind string
	Key  string
}

func billingDay(at *time.Time) string {
	if at == nil {
		return "unknown"
	}
	return at.UTC().Format("2006-01-02")
}

func lapsed(status string) bool {
	return status == "cancelled" || status == "expired" || status == "failed"
}

// billingTransitions decides what changed between two syncs. Keys include the subscription and
// the paid-through or effective date, so a redelivered webhook or a later re-sync never repeats one.
func billingTransitions(prev, next billingSnapshot, binding bool, now time.Time) []billingNotice {
	sub := next.Subscription
	paid := billingDay(next.PaidThrough)
	var notices []billingNotice
	add := func(kind, key string) {
		notices = append(notices, billingNotice{Kind: kind, Key: "billing:" + kind + ":" + sub + key})
	}
	ending := next.AccessUntil != nil && next.AccessUntil.After(now)

	if binding {
		if next.Status == "active" {
			add("activated", "")
		}
		return notices
	}
	if prev.Subscription != sub {
		return nil
	}
	switch {
	case lapsed(next.Status) && !lapsed(prev.Status):
		if ending {
			add("cancelling", ":"+paid)
		} else {
			add("ended", "")
		}
		return notices
	case next.Status == "active" && (prev.Status == "on_hold" || prev.Status == "past_due"):
		add("recovered", ":"+paid)
	case (next.Status == "on_hold" || next.Status == "past_due") && prev.Status == "active":
		add("payment_failed", ":"+paid)
	}
	if next.Status == "active" && (prev.Plan != next.Plan || prev.Interval != next.Interval) && prev.Plan != "" {
		add("changed", ":"+next.Plan+":"+next.Interval+":"+paid)
	}
	if next.CancelAtEnd && !prev.CancelAtEnd {
		add("cancelling", ":"+paid)
	}
	if !next.CancelAtEnd && prev.CancelAtEnd && next.Status == "active" {
		add("resumed", ":"+paid)
	}
	if !next.CancelAtEnd && next.Scheduled != "" && next.Scheduled != prev.Scheduled {
		add("scheduled", ":"+next.Scheduled+":"+billingDay(next.ScheduledAt))
	}
	return notices
}

func planLimits(plan billing.Plan) string {
	plural := func(count int, one, many string) string {
		if count == 1 {
			return fmt.Sprintf("%d %s", count, one)
		}
		return fmt.Sprintf("%d %s", count, many)
	}
	return fmt.Sprintf("%s deliveries a month, %s, %s and %d days of delivery history",
		withCommas(plan.Limits.MonthlyJobs), plural(int(plan.Limits.Projects), "project", "projects"),
		plural(int(plan.Limits.Members), "member", "members"), plan.RetentionDays)
}

func withCommas(value int64) string {
	digits := fmt.Sprint(value)
	var out strings.Builder
	for i, digit := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			out.WriteByte(',')
		}
		out.WriteRune(digit)
	}
	return out.String()
}

func readableDay(at *time.Time) string {
	if at == nil {
		return "the end of the paid period"
	}
	return at.UTC().Format("2 January 2006")
}

func cadence(interval string) string {
	if interval == "annual" {
		return "yearly"
	}
	return "monthly"
}

type billingMessage struct {
	Severity, Title, Body string
}

// renderBillingNotice writes the inbox and email text. It names no amounts: Dodo Payments
// sends receipts in the customer's currency, and this text never contradicts them.
func renderBillingNotice(kind, orgName string, prev, next billingSnapshot, nextPlan, prevPlan, scheduledPlan billing.Plan, scheduledInterval string) billingMessage {
	free, _ := billing.FindPlan("free")
	switch kind {
	case "activated":
		return billingMessage{"success", "Welcome to " + nextPlan.Name,
			fmt.Sprintf("%s is now on %s, billed %s. You can now use %s. Dodo Payments, our payment provider, sends your receipt separately. Thanks for supporting Cascadehook.",
				orgName, nextPlan.Name, cadence(next.Interval), planLimits(nextPlan))}
	case "changed":
		if billing.Upgrade(prev.Plan, prev.Interval, next.Plan, next.Interval) {
			return billingMessage{"success", "Your " + nextPlan.Name + " limits are live",
				fmt.Sprintf("%s moved from %s to %s, billed %s. You now have %s.", orgName, prevPlan.Name, nextPlan.Name, cadence(next.Interval), planLimits(nextPlan))}
		}
		return billingMessage{"info", orgName + " is now on " + nextPlan.Name,
			fmt.Sprintf("Your plan changed from %s to %s at renewal, billed %s. You now have %s. Usage already counted this month stays.",
				prevPlan.Name, nextPlan.Name, cadence(next.Interval), planLimits(nextPlan))}
	case "scheduled":
		return billingMessage{"info", "Your plan changes on " + readableDay(next.ScheduledAt),
			fmt.Sprintf("%s moves from %s to %s, billed %s, on %s. Until then you keep %s. After that you'll have %s. To keep your current plan, choose it on the Usage & billing page.",
				orgName, nextPlan.Name, scheduledPlan.Name, cadence(scheduledInterval), readableDay(next.ScheduledAt), nextPlan.Name, planLimits(scheduledPlan))}
	case "cancelling":
		return billingMessage{"warning", "Your " + nextPlan.Name + " plan ends on " + readableDay(next.AccessUntil),
			fmt.Sprintf("%s keeps %s until %s, then moves to Free with %s. Changed your mind? Choose Keep my plan on the Usage & billing page. We'd love to know why you cancelled: reply to this email or write to support.",
				orgName, nextPlan.Name, readableDay(next.AccessUntil), planLimits(free))}
	case "resumed":
		return billingMessage{"success", nextPlan.Name + " will keep renewing",
			fmt.Sprintf("Your cancellation was withdrawn. %s stays on %s and renews on %s.", orgName, nextPlan.Name, readableDay(next.PaidThrough))}
	case "payment_failed":
		return billingMessage{"error", "Payment needed to keep " + nextPlan.Name,
			fmt.Sprintf("The renewal payment for %s didn't go through. Update your payment method from Manage billing on the Usage & billing page. If it isn't fixed by %s, %s moves to Free and its limits drop.",
				orgName, readableDay(next.AccessUntil), orgName)}
	case "recovered":
		return billingMessage{"success", "Payment received for " + nextPlan.Name,
			fmt.Sprintf("The renewal for %s went through. %s continues until %s.", orgName, nextPlan.Name, readableDay(next.PaidThrough))}
	case "ended":
		return billingMessage{"info", orgName + " is now on Free",
			fmt.Sprintf("%s ended, so %s moved to Free with %s. Existing projects and endpoints stay; creating more is limited. You can choose a plan again anytime on the Usage & billing page.",
				nextPlan.Name, orgName, planLimits(free))}
	case "refunded":
		return billingMessage{"info", nextPlan.Name + " was refunded",
			fmt.Sprintf("Your %s payment was refunded in full, so %s is back on Free with %s.", nextPlan.Name, orgName, planLimits(free))}
	}
	return billingMessage{}
}

// notifyBilling records billing notices for owners and admins inside the billing transaction,
// so they exist exactly when the change is committed and queue emails the same way as other alerts.
func notifyBilling(ctx context.Context, tx pgx.Tx, org uuid.UUID, provider BillingProvider, prev, next billingSnapshot, notices []billingNotice) error {
	if len(notices) == 0 {
		return nil
	}
	var orgName string
	if err := tx.QueryRow(ctx, `SELECT name FROM organizations WHERE id=$1`, org).Scan(&orgName); err != nil {
		return fmt.Errorf("read organization name: %w", err)
	}
	nextPlan, _ := billing.FindPlan(next.Plan)
	prevPlan, _ := billing.FindPlan(prev.Plan)
	var scheduledPlan billing.Plan
	var scheduledInterval string
	if next.Scheduled != "" {
		scheduledPlan, scheduledInterval, _ = provider.PlanFor(next.Scheduled)
	}
	for _, notice := range notices {
		if notice.Kind == "scheduled" && scheduledPlan.ID == "" {
			continue
		}
		message := renderBillingNotice(notice.Kind, orgName, prev, next, nextPlan, prevPlan, scheduledPlan, scheduledInterval)
		if message.Title == "" {
			continue
		}
		_, err := emitNotification(ctx, tx, notificationEvent{
			OrganizationID: org, Type: "billing_" + notice.Kind, Category: notifications.Billing,
			Severity: message.Severity, Audience: "manager", Title: truncate(message.Title, 160), Body: truncate(message.Body, 600),
			ResourceType: "billing", ResourceID: org, SourceKey: truncate(notice.Key, 255),
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func truncate(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit-1]) + "…"
}
