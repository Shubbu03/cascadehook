package retention

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"cascadehook/internal/clerk"
)

type AccountDeleter interface {
	Issuer() string
	DeleteUser(context.Context, string) error
}

// Provider HTTP runs between a durable claim and fenced acknowledgement,
// without holding a database transaction or the cleanup advisory lock.
func (options Options) cleanupProvider(
	ctx context.Context,
	db Store,
	batch Batch,
	logger *slog.Logger,
) (BatchResult, error) {
	if options.AccountDeleter == nil {
		pending, err := db.HasPendingAccountDeletion(ctx)
		return BatchResult{ProviderPending: pending, ProviderUnavailable: pending}, err
	}
	job, err := db.ClaimAccountDeletion(ctx, options.AccountDeleter.Issuer())
	if err != nil {
		return BatchResult{}, err
	}
	if job.UserID == uuid.Nil {
		pending, err := db.HasPendingAccountDeletion(ctx)
		if err != nil {
			return BatchResult{}, err
		}
		// A due row for a different issuer requires matching credentials;
		// never send it to the currently configured Clerk instance.
		due, err := db.PreviewRetentionBatch(ctx, batch)
		return BatchResult{ProviderPending: pending, ProviderUnavailable: due > 0}, err
	}
	deleteErr := options.AccountDeleter.DeleteUser(ctx, job.Subject)
	exponent := min(max(job.Attempt-1, 0), 6)
	delay := min(time.Minute*time.Duration(1<<exponent), time.Hour)
	status, code := 0, "provider_error"
	var failure *clerk.DeleteError
	if errors.As(deleteErr, &failure) {
		delay = max(delay, failure.RetryAfter)
		status, code = failure.Status, failure.Code
	}
	if err := db.CompleteAccountDeletion(
		ctx,
		job,
		deleteErr == nil,
		delay,
	); err != nil {
		return BatchResult{}, fmt.Errorf("acknowledge provider deletion; lease expiry permits retry: %w", err)
	}
	if deleteErr != nil {
		logger.Warn(
			"Clerk account deletion deferred",
			"status",
			status,
			"code",
			code,
			"retry_delay",
			delay.String(),
		)
	}
	pending, err := db.HasPendingAccountDeletion(ctx)
	return BatchResult{Rows: 1, ProviderFailed: deleteErr != nil, ProviderPending: pending}, err
}

func providerPendingError(report Report) error {
	if report.ProviderPending && (report.ProviderUnavailable || report.ProviderFailures > 0) {
		return fmt.Errorf("Clerk account deletion remains pending; check provider configuration and deferred deletion logs")
	}
	return nil
}
