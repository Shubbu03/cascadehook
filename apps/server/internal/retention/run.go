package retention

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"cascadehook/internal/accounts"
)

type Store interface {
	RetentionClock(context.Context) (time.Time, error)
	PreviewRetentionBatch(context.Context, Batch) (int64, error)
	CleanupRetentionBatch(context.Context, Batch) (BatchResult, error)
	ClaimAccountDeletion(context.Context, string) (accounts.ProviderDeletion, error)
	CompleteAccountDeletion(context.Context, accounts.ProviderDeletion, bool, time.Duration) error
	HasPendingAccountDeletion(context.Context) (bool, error)
}

type Options struct {
	Config
	DryRun         bool
	AccountDeleter AccountDeleter
}

// Run is a one-shot job. Local batches commit separately; provider operations
// use a claim and acknowledgement around HTTP. Every phase has its own deadline.
func Run(ctx context.Context, db Store, options Options, logger *slog.Logger) (Report, error) {
	report := Report{
		DryRun: options.DryRun, BatchSize: options.BatchSize,
		Status: "failed", Rows: make(map[Phase]int64, len(Phases())),
	}
	for _, phase := range Phases() {
		report.Rows[phase] = 0
	}
	if err := options.Config.Validate(); err != nil {
		return report, err
	}
	ctx, cancel := context.WithTimeout(ctx, options.RunTimeout)
	defer cancel()
	opCtx, opCancel := context.WithTimeout(ctx, OperationTimeout)
	clock, err := db.RetentionClock(opCtx)
	opCancel()
	if err != nil {
		return report, fmt.Errorf("read retention clock: %w", err)
	}
	report.Reference = clock.UTC()
	report.Cutoff = report.Reference.Add(-time.Duration(options.Days) * 24 * time.Hour)
	for report.Batches < options.MaxBatches {
		var passRows int64
		for _, phase := range Phases() {
			if report.Batches == options.MaxBatches {
				report.Status = "batch_limit"
				return report, providerPendingError(report)
			}
			batch := Batch{
				Phase: phase, Limit: options.BatchSize,
				Reference: report.Reference, Cutoff: report.Cutoff,
			}
			opCtx, opCancel := context.WithTimeout(ctx, OperationTimeout)
			var result BatchResult
			if options.DryRun {
				result.Rows, err = db.PreviewRetentionBatch(opCtx, batch)
			} else if phase == DeleteProviderAccounts {
				result, err = options.cleanupProvider(
					opCtx,
					db,
					batch,
					logger,
				)
			} else {
				result, err = db.CleanupRetentionBatch(opCtx, batch)
			}
			opCancel()
			if err != nil {
				return report, fmt.Errorf("retention phase %s: %w", phase, err)
			}
			if result.Busy {
				report.Status = "busy"
				return report, providerPendingError(report)
			}
			if phase == DeleteProviderAccounts {
				report.ProviderPending = result.ProviderPending
				if result.ProviderFailed {
					report.ProviderFailures++
				}
				if result.ProviderUnavailable && !report.ProviderUnavailable {
					logger.Warn("pending account deletions need matching Clerk issuer/secret configuration")
					report.ProviderUnavailable = true
				}
			}
			report.Batches++
			report.Rows[phase] += result.Rows
			passRows += result.Rows
			logger.Debug(
				"retention batch finished",
				"phase",
				phase,
				"rows",
				result.Rows,
				"dry_run",
				options.DryRun,
			)
		}
		if options.DryRun {
			report.Status = "preview"
			return report, nil
		}
		if passRows == 0 {
			// SKIP LOCKED can omit busy work. This reports only what this job
			// could acquire, rather than claiming the database has no backlog.
			report.Status = "no_work_acquired"
			if report.ProviderPending {
				report.Status = "provider_pending"
			}
			return report, providerPendingError(report)
		}
	}
	report.Status = "batch_limit"
	return report, providerPendingError(report)
}
