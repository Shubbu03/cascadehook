package auth

import (
	"errors"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/google/uuid"

	"cascadehook/internal/pagination"
)

const APIKeyRotationOverlap = 5 * time.Minute

type KeyEnvironment string

const (
	EnvironmentDevelopment KeyEnvironment = "dev"
	EnvironmentLive        KeyEnvironment = "live"
)

// KeyScope limits what a project API key can do. Session callers are not scoped.
type KeyScope string

const (
	ScopeFull    KeyScope = "full"
	ScopePublish KeyScope = "publish"
	ScopeRead    KeyScope = "read"
)

// Permission is what one request needs from its API key.
type Permission int

const (
	PermitStatus Permission = iota
	PermitRead
	PermitPublish
	PermitManage
)

func ValidKeyScope(scope KeyScope) bool {
	return scope == ScopeFull || scope == ScopePublish || scope == ScopeRead
}

func (scope KeyScope) Allows(permission Permission) bool {
	switch permission {
	case PermitStatus:
		return ValidKeyScope(scope)
	case PermitRead:
		return scope == ScopeFull || scope == ScopeRead
	case PermitPublish:
		return scope == ScopeFull || scope == ScopePublish
	default:
		return scope == ScopeFull
	}
}

type KeyStatus string

const (
	KeyActive  KeyStatus = "active"
	KeyExpired KeyStatus = "expired"
	KeyRevoked KeyStatus = "revoked"
)

var (
	ErrAPIKeyNotFound        = errors.New("API key not found")
	ErrInvalidKeyName        = errors.New("API key name must contain 1 to 100 characters without control characters")
	ErrInvalidKeyEnvironment = errors.New("API key environment must be dev or live")
	ErrInvalidKeyScope       = errors.New("API key scope must be full, publish, or read")
	ErrInsufficientScope     = errors.New("API key scope does not allow this request")
	ErrInvalidKeyExpiry      = errors.New("API key expiry must be in the future")
	ErrInactiveAPIKey        = errors.New("inactive API keys cannot be rotated")
	ErrAPIKeyRotationPending = errors.New("API key already has a replacement")
	ErrLastUsableAPIKey      = errors.New("create a usable full-access replacement before revoking the last full-access API key")
)

// APIKey is a metadata allowlist. Hashes and complete credentials are absent.
type APIKey struct {
	ID                uuid.UUID      `json:"id"`
	ProjectID         uuid.UUID      `json:"project_id"`
	Name              string         `json:"name"`
	Prefix            string         `json:"prefix"`
	Environment       KeyEnvironment `json:"environment"`
	Scope             KeyScope       `json:"scope"`
	Status            KeyStatus      `json:"status"`
	CreatedAt         time.Time      `json:"created_at"`
	ExpiresAt         *time.Time     `json:"expires_at"`
	RevokedAt         *time.Time     `json:"revoked_at"`
	RevokesAt         *time.Time     `json:"revokes_at"`
	RotatedToID       *uuid.UUID     `json:"rotated_to_id"`
	CreatedByAPIKeyID *uuid.UUID     `json:"created_by_api_key_id"`
	RevokedByAPIKeyID *uuid.UUID     `json:"revoked_by_api_key_id"`
	CreatedByUserID   *uuid.UUID     `json:"created_by_user_id"`
	RevokedByUserID   *uuid.UUID     `json:"revoked_by_user_id"`
}

func (key APIKey) StatusAt(at time.Time) KeyStatus {
	if key.RevokedAt != nil || (key.RevokesAt != nil && !key.RevokesAt.After(at)) {
		return KeyRevoked
	}
	if key.ExpiresAt != nil && !key.ExpiresAt.After(at) {
		return KeyExpired
	}
	return KeyActive
}

type KeyListOptions struct {
	pagination.Options
	Environment KeyEnvironment
	Status      KeyStatus
}

func ValidKeyEnvironment(environment KeyEnvironment) bool {
	return environment == EnvironmentDevelopment || environment == EnvironmentLive
}

func ValidKeyStatus(status KeyStatus) bool {
	return status == KeyActive || status == KeyExpired || status == KeyRevoked
}

func NormalizeKeyName(value string) (string, error) {
	value = strings.TrimSpace(value)
	if !utf8.ValidString(value) || utf8.RuneCountInString(value) < 1 || utf8.RuneCountInString(value) > 100 {
		return "", ErrInvalidKeyName
	}
	for _, character := range value {
		if unicode.IsControl(character) {
			return "", ErrInvalidKeyName
		}
	}
	return value, nil
}
