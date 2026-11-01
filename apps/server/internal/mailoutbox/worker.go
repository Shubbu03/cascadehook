package mailoutbox

import (
	"context"
	"errors"
	"log/slog"
	"net/url"
	"time"

	"cascadehook/internal/clerk"
)

func Run(ctx context.Context, cfg Config, db Repository, identity *clerk.Client, vault *Cipher, logger *slog.Logger) {
	var provider *Provider
	if cfg.Enabled() {
		provider = NewProvider(cfg.APIKey)
		defer provider.Close()
	}
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	lastCleanup := time.Time{}
	for ctx.Err() == nil {
		opCtx, cancel := context.WithTimeout(ctx, 40*time.Second)
		if time.Since(lastCleanup) >= time.Minute {
			if err := db.CleanEmailOutbox(opCtx); err != nil {
				logger.Warn("email maintenance failed", "error", err)
			}
			lastCleanup = time.Now()
			if identity != nil {
				revocations, err := db.PendingEmailRevocations(opCtx)
				if err != nil {
					logger.Warn("invitation revocation lookup failed", "error", err)
				}
				for _, item := range revocations {
					if err := identity.RevokeInvitation(opCtx, item.ClerkID); err != nil {
						logger.Warn("provider invitation revocation failed", "error", err)
						break
					}
					if err := db.FinishEmailRevocation(opCtx, item.JobID); err != nil {
						logger.Warn("invitation revocation result failed", "error", err)
						break
					}
				}
			}
		}
		if provider != nil {
			job, err := db.ClaimEmail(opCtx, cfg.DailyLimit)
			if err != nil {
				logger.Warn("email claim failed", "error", err)
			}
			if job != nil {
				result := deliver(opCtx, cfg, db, identity, provider, vault, *job)
				if err := db.FinishEmail(opCtx, *job, result); err != nil {
					logger.Warn("email result could not be saved", "job_id", job.ID, "error", err)
				}
			}
		}
		cancel()
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func deliver(ctx context.Context, cfg Config, db Repository, identity *clerk.Client, provider *Provider, vault *Cipher, job Job) Completion {
	if time.Since(job.FirstAttemptAt) >= 23*time.Hour || time.Now().After(job.ExpiresAt) {
		return Completion{ErrorCode: "retry_window_expired"}
	}
	active, err := db.EmailActive(ctx, job)
	if err != nil {
		return retry(job, "database_unavailable", time.Minute)
	}
	if !active {
		return Completion{Cancelled: true}
	}
	var body []byte
	if len(job.Payload) > 0 {
		body, err = vault.Decrypt(job)
		if err != nil {
			return Completion{ErrorCode: "email_payload_unavailable"}
		}
	} else {
		destination := cfg.InvitationURL + "?invitation=" + url.QueryEscape(job.InvitationID.String())
		link, clerkID, err := identity.InvitationLink(ctx, job.Email, destination, job.ExpiresAt)
		if err != nil {
			var upstream *clerk.DeleteError
			if errors.As(err, &upstream) && (upstream.Status == 401 || upstream.Status == 403) {
				return Completion{ErrorCode: "identity_configuration_error"}
			}
			wait := time.Minute
			if upstream != nil {
				wait = max(wait, upstream.RetryAfter)
			}
			return retry(job, "identity_invitation_unavailable", wait)
		}
		body, err = invitationMessage(cfg, job, link)
		if err != nil {
			return Completion{ErrorCode: "email_render_failed"}
		}
		if err := db.SaveEmailPayload(ctx, job, vault.Encrypt(job, body), clerkID); err != nil {
			clear(body)
			return retry(job, "email_payload_not_saved", time.Minute)
		}
	}
	defer clear(body)
	active, err = db.EmailActive(ctx, job)
	if err != nil {
		return retry(job, "database_unavailable", time.Minute)
	}
	if !active {
		return Completion{Cancelled: true}
	}
	id, err := provider.Send(ctx, job.ID, body)
	if err == nil {
		return Completion{MessageID: id}
	}
	var upstream *ProviderError
	if errors.As(err, &upstream) {
		if upstream.Status >= 400 && upstream.Status < 500 && upstream.Status != 408 && upstream.Status != 429 {
			return Completion{ErrorCode: "email_rejected"}
		}
		return retry(job, "email_temporarily_unavailable", upstream.RetryAfter)
	}
	return retry(job, "email_temporarily_unavailable", time.Minute)
}

func retry(job Job, code string, wait time.Duration) Completion {
	if job.Attempts >= 10 {
		return Completion{ErrorCode: code}
	}
	wait = max(wait, time.Minute*time.Duration(1<<min(job.Attempts-1, 8)))
	at := time.Now().Add(wait)
	if !at.Before(job.FirstAttemptAt.Add(23*time.Hour)) || !at.Before(job.ExpiresAt) {
		return Completion{ErrorCode: "retry_window_expired"}
	}
	return Completion{ErrorCode: code, RetryAt: &at}
}
