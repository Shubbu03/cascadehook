package worker

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"cascadehook/internal/deliveries"
	"cascadehook/internal/delivery"
	"cascadehook/internal/signing"
)

// Only credential decryption errors stop the engine. They indicate operator
// configuration/ciphertext problems; consuming retries would damage good jobs.
func processDelivery(ctx context.Context, db Queue, outbound *delivery.Client, vault *signing.Vault, job deliveries.Job, logger *slog.Logger) error {
	logger = logger.With("delivery_id", job.DeliveryID, "event_id", job.EventID, "endpoint_id", job.EndpointID, "cycle", job.Cycle)
	secret, err := vault.Decrypt(job.ProjectID, job.EndpointID, job.SigningSecret)
	if err != nil {
		return fmt.Errorf("decrypt endpoint signing secret for delivery %s: %w", job.DeliveryID, err)
	}
	var previous *signing.Secret
	if len(job.PreviousSigningSecret) > 0 {
		decoded, err := vault.Decrypt(job.ProjectID, job.EndpointID, job.PreviousSigningSecret)
		if err != nil {
			return fmt.Errorf("decrypt previous signing secret for delivery %s: %w", job.DeliveryID, err)
		}
		previous = &decoded
	}
	intentStarted := time.Now()
	opCtx, cancel := context.WithTimeout(ctx, queueOperationTimeout)
	attempt, err := db.BeginDeliveryAttempt(opCtx, job)
	cancel()
	if err != nil {
		if !errors.Is(err, deliveries.ErrLeaseLost) && !errors.Is(err, deliveries.ErrAttemptStarted) && ctx.Err() == nil {
			logger.Warn("delivery intent was not confirmed; reservation left for recovery", "error", err)
		}
		return nil
	}
	if attempt.ID == uuid.Nil {
		return nil
	}
	if !attempt.UsePreviousSecret {
		previous = nil
	}
	// Include intent/commit latency in the monotonic request budget. Starting
	// a fresh timeout after commit could extend a near-expired retry horizon.
	requestCtx, requestCancel := context.WithDeadline(ctx, intentStarted.Add(attempt.Timeout))
	started := time.Now()
	var response delivery.Response
	requestErr := requestCtx.Err()
	if requestErr == nil {
		response, requestErr = outbound.PostJSON(requestCtx, job.URL, job.Payload,
			secret.Headers(job.DeliveryID, job.Payload, attempt.StartedAt, previous))
	}
	elapsed := time.Since(started)
	requestCancel()
	result := delivery.Classify(response, requestErr, attempt.Number, elapsed)
	// Preserve a received 2xx even when shutdown interrupts response-body reads.
	if ctx.Err() != nil && result.StatusCode == 0 {
		result.Outcome, result.ErrorCode = deliveries.OutcomeInterrupted, "worker_shutdown"
		result.RetryDelay, result.RetryAfterDelay, result.RetryAfterAt = 0, 0, nil
	}
	// A fresh deadline allows results to commit after forced request cancellation.
	persistCtx, persistCancel := context.WithTimeout(context.WithoutCancel(ctx), queueOperationTimeout)
	defer persistCancel()
	var completion deliveries.Completion
	for retry := 0; retry < 3; retry++ {
		completion, err = db.CompleteDelivery(persistCtx, attempt, result)
		if err == nil {
			break
		}
		if errors.Is(err, deliveries.ErrLeaseLost) {
			logger.Debug("delivery result rejected after lease loss", "attempt", attempt.Number)
			return nil
		}
		if persistCtx.Err() != nil || retry == 2 {
			break
		}
		timer := time.NewTimer(time.Duration(retry+1) * 100 * time.Millisecond)
		select {
		case <-persistCtx.Done():
			timer.Stop()
		case <-timer.C:
		}
	}
	if err != nil {
		logger.Error("delivery outcome not persisted; lease recovery will resolve uncertain result", "attempt", attempt.Number, "error", err)
		return nil
	}
	// Recovery may already have finalized an expired intent as interrupted;
	// distinguish this process's observation from the committed queue state.
	logger.Info("delivery attempt finalized", "attempt", attempt.Number, "observed_outcome", result.Outcome,
		"observed_status_code", result.StatusCode, "observed_error_code", result.ErrorCode, "duration_ms", result.Duration.Milliseconds(),
		"state", completion.State, "terminal_reason", completion.TerminalReason, "next_attempt_at", completion.NextAttemptAt)
	return nil
}
