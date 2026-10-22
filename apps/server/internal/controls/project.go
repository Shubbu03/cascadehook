// Package controls defines operator-owned project suspension state.
package controls

import (
	"errors"
	"regexp"
	"time"

	"github.com/google/uuid"
)

var (
	ErrProjectNotFound = errors.New("project not found")
	ErrSuspended       = errors.New("project is suspended")
	ErrVersionChanged  = errors.New("project control version changed; read the current status before retrying")
	ErrVersionLimit    = errors.New("project control version limit reached")
	ErrInvalidChange   = errors.New("project, nonnegative expected version, reason code, and operator label are required")
)

var (
	reasonPattern   = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)
	operatorPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$`)
)

type ProjectState struct {
	ProjectID   uuid.UUID  `json:"project_id"`
	Suspended   bool       `json:"suspended"`
	SuspendedAt *time.Time `json:"suspended_at"`
	Reason      *string    `json:"reason"`
	Version     int64      `json:"version"`
}

type ProjectChange struct {
	ProjectID       uuid.UUID
	Suspended       bool
	ExpectedVersion int64
	Reason          string
	OperatorLabel   string
}

func (change ProjectChange) Validate() error {
	validProject := change.ProjectID != uuid.Nil
	validVersion := change.ExpectedVersion >= 0
	validAudit := reasonPattern.MatchString(change.Reason) && operatorPattern.MatchString(change.OperatorLabel)
	if !validProject || !validVersion || !validAudit {
		return ErrInvalidChange
	}
	return nil
}

// OperatorLabel is a supplied audit label, not an authenticated account ID.
// Authorization comes from the operator's database access; no public API can
// submit a project control change.
type ProjectAction struct {
	ID            uuid.UUID `json:"id"`
	ProjectID     uuid.UUID `json:"project_id"`
	Action        string    `json:"action"`
	Reason        string    `json:"reason"`
	OperatorLabel string    `json:"operator_label"`
	Version       int64     `json:"version"`
	CreatedAt     time.Time `json:"created_at"`
}
