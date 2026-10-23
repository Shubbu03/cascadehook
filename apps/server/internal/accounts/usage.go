package accounts

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var ErrQuotaExceeded = errors.New("resource or monthly usage quota exceeded")

type QuotaError struct{ Resource string }

func (err *QuotaError) Error() string { return "quota exceeded: " + err.Resource }
func (err *QuotaError) Unwrap() error { return ErrQuotaExceeded }

type Quotas struct {
	Projects      int   `json:"projects"`
	Members       int   `json:"members"`
	Endpoints     int   `json:"endpoints_per_project"`
	APIKeys       int   `json:"active_api_keys_per_project"`
	MonthlyEvents int64 `json:"monthly_events"`
	MonthlyJobs   int64 `json:"monthly_deliveries"`
	StoredBytes   int64 `json:"payload_bytes_per_project"`
}

type QuotaChange struct {
	OrganizationID  uuid.UUID
	ExpectedVersion int64
	Operator        string
	Limits          Quotas
}

type UsageCounters struct {
	Events       int64 `json:"events"`
	Deliveries   int64 `json:"deliveries"`
	PayloadBytes int64 `json:"accepted_payload_bytes"`
	Attempts     int64 `json:"attempts_started"`
	Replays      int64 `json:"replays"`
	Succeeded    int64 `json:"successful_attempts"`
	Failed       int64 `json:"unsuccessful_attempts"`
}

type Usage struct {
	OrganizationID uuid.UUID     `json:"organization_id"`
	ProjectID      *uuid.UUID    `json:"project_id,omitempty"`
	Period         string        `json:"period"`
	ResetsAt       time.Time     `json:"resets_at"`
	Counters       UsageCounters `json:"usage"`
	Quotas         Quotas        `json:"limits"`
	StoredBytes    int64         `json:"stored_payload_bytes"`
	Projects       int           `json:"projects"`
	Members        int           `json:"members"`
	Endpoints      int           `json:"endpoints"`
	APIKeys        int           `json:"active_api_keys"`
}
