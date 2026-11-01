// Package mailoutbox delivers transactional email from a durable database queue.
package mailoutbox

import (
	"context"
	"fmt"
	"net/mail"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Config struct {
	APIKey        string `json:"-"`
	From          string
	WebhookSecret string `json:"-"`
	InvitationURL string
	DailyLimit    int
}

func (cfg Config) Enabled() bool { return cfg.APIKey != "" }

func (cfg Config) Validate() error {
	if !cfg.Enabled() {
		return nil
	}
	if !strings.HasPrefix(cfg.APIKey, "re_") || strings.ContainsAny(cfg.APIKey, " \r\n\t") {
		return fmt.Errorf("RESEND_API_KEY must be a Resend API key")
	}
	if _, err := mail.ParseAddress(cfg.From); err != nil || strings.ContainsAny(cfg.From, "\r\n") {
		return fmt.Errorf("EMAIL_FROM must be a valid sender address")
	}
	u, err := url.Parse(cfg.InvitationURL)
	if err != nil || u.Hostname() == "" {
		return fmt.Errorf("INVITATION_ACCEPT_URL must be an application URL")
	}
	local := u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1"
	if u.Scheme != "https" && !(u.Scheme == "http" && local) {
		return fmt.Errorf("INVITATION_ACCEPT_URL must use HTTPS, or HTTP on loopback during development")
	}
	if u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.ForceQuery || u.Path != "/invitations/accept" {
		return fmt.Errorf("INVITATION_ACCEPT_URL must end in /invitations/accept without query, credentials or fragment")
	}
	if cfg.DailyLimit < 1 || cfg.DailyLimit > 1000000 {
		return fmt.Errorf("EMAIL_DAILY_LIMIT must be between 1 and 1000000")
	}
	_, err = NewWebhook(cfg.WebhookSecret)
	return err
}

type Job struct {
	ID                uuid.UUID
	LeaseID           uuid.UUID
	InvitationID      uuid.UUID
	OrganizationID    uuid.UUID
	Email             string
	OrganizationName  string
	Role              string
	ExpiresAt         time.Time
	Attempts          int
	FirstAttemptAt    time.Time
	Payload           []byte
	ClerkInvitationID string
}

type Message struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html"`
	Text    string   `json:"text"`
	Tags    []Tag    `json:"tags"`
}

type Tag struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type Completion struct {
	MessageID string
	ErrorCode string
	RetryAt   *time.Time
	Cancelled bool
}

type Event struct {
	JobID      uuid.UUID
	ID         string
	MessageID  string
	State      string
	OccurredAt time.Time
}

type Revocation struct {
	JobID   uuid.UUID
	ClerkID string
}

type Repository interface {
	ClaimEmail(context.Context, int) (*Job, error)
	EmailActive(context.Context, Job) (bool, error)
	SaveEmailPayload(context.Context, Job, []byte, string) error
	FinishEmail(context.Context, Job, Completion) error
	CleanEmailOutbox(context.Context) error
	PendingEmailRevocations(context.Context) ([]Revocation, error)
	FinishEmailRevocation(context.Context, uuid.UUID) error
}
