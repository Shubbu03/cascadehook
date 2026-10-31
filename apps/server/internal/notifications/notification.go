// Package notifications defines the personal inbox within an organization.
package notifications

import (
	"errors"
	"time"

	"github.com/google/uuid"

	"cascadehook/internal/pagination"
)

var ErrNotFound = errors.New("notification not found")

type Category string

const (
	Team        Category = "team"
	Access      Category = "access"
	Project     Category = "project"
	Credentials Category = "credentials"
	Usage       Category = "usage"
	Delivery    Category = "delivery"
)

func (category Category) Valid() bool {
	switch category {
	case Team, Access, Project, Credentials, Usage, Delivery:
		return true
	}
	return false
}

type State string

const (
	All      State = "all"
	Unread   State = "unread"
	Read     State = "read"
	Archived State = "archived"
)

func (state State) Valid() bool {
	return state == All || state == Unread || state == Read || state == Archived
}

type Target struct {
	Type string     `json:"type"`
	ID   *uuid.UUID `json:"id"`
}

// Notification exposes safe display content, never credentials or event bodies.
type Notification struct {
	ID              uuid.UUID  `json:"id"`
	OrganizationID  uuid.UUID  `json:"organization_id"`
	ProjectID       *uuid.UUID `json:"project_id"`
	Type            string     `json:"type"`
	Category        Category   `json:"category"`
	Severity        string     `json:"severity"`
	Title           string     `json:"title"`
	Body            string     `json:"body"`
	Target          Target     `json:"target"`
	ActorUserID     *uuid.UUID `json:"actor_user_id"`
	OccurrenceCount int64      `json:"occurrence_count"`
	ResolvedAt      *time.Time `json:"resolved_at"`
	CreatedAt       time.Time  `json:"created_at"`
	ReadAt          *time.Time `json:"read_at"`
	ArchivedAt      *time.Time `json:"archived_at"`
}

type Filters struct {
	ProjectID *uuid.UUID
	Category  Category
	State     State
}

func (filters Filters) Valid() bool {
	validProject := filters.ProjectID == nil || *filters.ProjectID != uuid.Nil
	validCategory := filters.Category == "" || filters.Category.Valid()
	return validProject && validCategory && filters.State.Valid()
}

type ListOptions struct {
	pagination.Options
	Filters
}

type Update struct {
	Read     *bool
	Archived *bool
}

// Cursor binds pagination to the organization and the exact list filters.
type Cursor struct {
	pagination.Cursor
	OrganizationID uuid.UUID  `json:"organization_id"`
	ProjectID      *uuid.UUID `json:"project_id"`
	Category       Category   `json:"category"`
	State          State      `json:"state"`
}

func (cursor Cursor) Matches(organizationID uuid.UUID, filters Filters) bool {
	projectsMatch := cursor.ProjectID == nil && filters.ProjectID == nil ||
		cursor.ProjectID != nil && filters.ProjectID != nil && *cursor.ProjectID == *filters.ProjectID
	scopeMatches := cursor.OrganizationID == organizationID && projectsMatch
	filtersMatch := cursor.Category == filters.Category && cursor.State == filters.State
	return cursor.Valid() && scopeMatches && filtersMatch
}
