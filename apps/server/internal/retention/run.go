package retention

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

type Store interface {
	RetentionClock(context.Context) (time.Time, error)
	PreviewRetentionBatch(context.Context, Batch) (int64, error)
	CleanupRetentionBatch(context.Context, Batch) (BatchResult, error)
}

type Options struct {
	Config
	DryRun bool
}

// Run is a one-shot job. Each operation is bounded independently and commits
// its own progress, so cancellation or a run limit can resume on the next job.
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
				return report, nil
			}
			batch := Batch{
				Phase: phase, Limit: options.BatchSize,
				Reference: report.Reference, Cutoff: report.Cutoff,
			}
			opCtx, opCancel := context.WithTimeout(ctx, OperationTimeout)
			var result BatchResult
			if options.DryRun {
				result.Rows, err = db.PreviewRetentionBatch(opCtx, batch)
			} else {
				result, err = db.CleanupRetentionBatch(opCtx, batch)
			}
			opCancel()
			if err != nil {
				return report, fmt.Errorf("retention phase %s: %w", phase, err)
			}
			if result.Busy {
				report.Status = "busy"
				return report, nil
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
			return report, nil
		}
	}
	report.Status = "batch_limit"
	return report, nil
}
