package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"cascadehook/internal/retention"
)

type RetentionPolicyReport struct {
	HistoryDays      *int       `json:"history_days"`
	NotificationDays *int       `json:"notification_days"`
	AuditDays        int        `json:"audit_days"`
	ReportedAt       *time.Time `json:"reported_at"`
}

func (s *Store) RecordRetentionPolicy(ctx context.Context, cfg retention.Config) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO retention_policy_reports(singleton,history_days,notification_days)
		VALUES(true,$1,$2) ON CONFLICT(singleton) DO UPDATE SET history_days=EXCLUDED.history_days,
		notification_days=EXCLUDED.notification_days,reported_at=clock_timestamp()`, cfg.Days, cfg.NotificationDays)
	if err != nil {
		return fmt.Errorf("record retention policy: %w", err)
	}
	return nil
}

func (s *Store) RetentionPolicy(ctx context.Context) (RetentionPolicyReport, error) {
	report := RetentionPolicyReport{AuditDays: AuditRetentionDays}
	err := s.pool.QueryRow(ctx, `SELECT history_days,notification_days,reported_at FROM retention_policy_reports
		WHERE singleton`).Scan(&report.HistoryDays, &report.NotificationDays, &report.ReportedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return report, nil
	}
	if err != nil {
		return RetentionPolicyReport{}, fmt.Errorf("read retention policy: %w", err)
	}
	return report, nil
}
