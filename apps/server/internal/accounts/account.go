// Package accounts defines human account and organization access boundaries.
package accounts

import (
	"errors"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/google/uuid"
)

var (
	ErrNotFound       = errors.New("account resource not found")
	ErrForbidden      = errors.New("organization permission required")
	ErrInvalidName    = errors.New("name must contain 1 to 100 characters without control characters")
	ErrInvalidRole    = errors.New("role must be owner, admin, or member")
	ErrUserNotFound   = errors.New("user must sign in before being added to an organization")
	ErrAlreadyMember  = errors.New("user is already an organization member")
	ErrLastOwner      = errors.New("organization must retain an owner")
	ErrMemberNotFound = errors.New("organization member not found")
)

type Role string

const (
	Owner  Role = "owner"
	Admin  Role = "admin"
	Member Role = "member"
)

func (role Role) Valid() bool {
	return role == Owner || role == Admin || role == Member
}

func (role Role) CanManageProjects() bool {
	return role == Owner || role == Admin
}

type User struct {
	ID        uuid.UUID `json:"id"`
	CreatedAt time.Time `json:"created_at"`
}

type Organization struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Role      Role      `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Membership struct {
	UserID         uuid.UUID `json:"user_id"`
	OrganizationID uuid.UUID `json:"organization_id"`
	Role           Role      `json:"role"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type Project struct {
	ID             uuid.UUID `json:"id"`
	OrganizationID uuid.UUID `json:"organization_id"`
	Name           string    `json:"name"`
	Role           Role      `json:"role"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func NormalizeName(value string) (string, error) {
	value = strings.TrimSpace(value)
	length := utf8.RuneCountInString(value)
	if !utf8.ValidString(value) || length < 1 || length > 100 {
		return "", ErrInvalidName
	}
	for _, character := range value {
		if unicode.IsControl(character) {
			return "", ErrInvalidName
		}
	}
	return value, nil
}
