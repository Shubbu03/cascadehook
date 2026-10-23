// Package retention defines bounded history retention and requested project deletion.
package retention

import (
	"fmt"
	"time"
)

const (
	DefaultDays       = 30
	DefaultBatchSize  = 100
	DefaultMaxBatches = 100
	DefaultRunTimeout = 5 * time.Minute
	OperationTimeout  = 10 * time.Second
	MaxDays           = 3650
	MaxBatchSize      = 1000
	MaxBatches        = 1000
)

type Config struct {
	Days       int
	BatchSize  int
	MaxBatches int
	RunTimeout time.Duration
}

func Defaults() Config {
	return Config{
		Days: DefaultDays, BatchSize: DefaultBatchSize,
		MaxBatches: DefaultMaxBatches, RunTimeout: DefaultRunTimeout,
	}
}

func (cfg Config) Validate() error {
	if cfg.Days < 1 || cfg.Days > MaxDays {
		return fmt.Errorf("RETENTION_DAYS must be between 1 and %d", MaxDays)
	}
	if cfg.BatchSize < 1 || cfg.BatchSize > MaxBatchSize {
		return fmt.Errorf("JANITOR_BATCH_SIZE must be between 1 and %d", MaxBatchSize)
	}
	if cfg.MaxBatches < len(Phases()) || cfg.MaxBatches > MaxBatches {
		return fmt.Errorf("JANITOR_MAX_BATCHES must be between %d and %d", len(Phases()), MaxBatches)
	}
	if cfg.RunTimeout < OperationTimeout || cfg.RunTimeout > time.Hour {
		return fmt.Errorf("JANITOR_RUN_TIMEOUT must be between 10s and 1h")
	}
	return nil
}

type Phase string

const (
	ExpireKeys       Phase = "expired_idempotency_keys"
	MarkEvents       Phase = "retired_event_groups"
	DeleteAttempts   Phase = "delivery_attempts"
	DeleteReplays    Phase = "delivery_replays"
	DeleteDeliveries Phase = "deliveries"
	DeleteEvents     Phase = "events"
	DeleteProjects   Phase = "project_deletion_rows"
)

func Phases() []Phase {
	return []Phase{ExpireKeys, MarkEvents, DeleteAttempts, DeleteReplays, DeleteDeliveries, DeleteEvents, DeleteProjects}
}

type Batch struct {
	Phase     Phase
	Limit     int
	Reference time.Time
	Cutoff    time.Time
}

func (batch Batch) Validate() error {
	if batch.Limit < 1 || batch.Limit > MaxBatchSize {
		return fmt.Errorf("invalid retention batch limit")
	}
	missingBoundary := batch.Reference.IsZero() || batch.Cutoff.IsZero()
	if missingBoundary || !batch.Cutoff.Before(batch.Reference) {
		return fmt.Errorf("invalid retention time boundaries")
	}
	for _, phase := range Phases() {
		if batch.Phase == phase {
			return nil
		}
	}
	return fmt.Errorf("invalid retention phase")
}

type BatchResult struct {
	Rows int64
	Busy bool
}

type Report struct {
	DryRun    bool            `json:"dry_run"`
	Reference time.Time       `json:"reference_time"`
	Cutoff    time.Time       `json:"retention_cutoff"`
	BatchSize int             `json:"batch_size"`
	Batches   int             `json:"batches"`
	Status    string          `json:"status"`
	Rows      map[Phase]int64 `json:"phase_rows"`
}
