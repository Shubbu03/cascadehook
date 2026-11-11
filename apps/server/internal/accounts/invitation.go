package accounts

import (
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrInvalidEmail          = errors.New("a plain email address is required")
	ErrInvitationConflict    = errors.New("an invitation for this email is already pending")
	ErrInvitationInvalid     = errors.New("invitation is invalid, expired or unavailable")
	ErrInvitationEmail       = errors.New("sign in with a verified email matching the invitation")
	ErrInvitationRateLimited = errors.New("wait before another invitation identity lookup")
	ErrInvitationResend      = errors.New("wait before resending this invitation")
)

type Invitation struct {
	ID             uuid.UUID  `json:"id"`
	OrganizationID uuid.UUID  `json:"organization_id"`
	Email          string     `json:"email"`
	Role           Role       `json:"role"`
	CreatedAt      time.Time  `json:"created_at"`
	ExpiresAt      time.Time  `json:"expires_at"`
	AcceptedAt     *time.Time `json:"accepted_at"`
	RevokedAt      *time.Time `json:"revoked_at"`
	ProjectID      *uuid.UUID `json:"project_id"`
	EmailStatus    string     `json:"email_status"`
	LastEmailAt    *time.Time `json:"last_email_at"`
}

func NormalizeEmail(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	address, err := mail.ParseAddress(value)
	if err != nil || address.Address != value || address.Name != "" || len(value) > 254 {
		return "", ErrInvalidEmail
	}
	for _, char := range value {
		if char < 33 || char > 126 {
			return "", ErrInvalidEmail
		}
	}
	return value, nil
}

// NewInvitationHash returns the random lookup key stored as token_hash. No
// plaintext token exists: invitations are accepted by ID after an email check.
func NewInvitationHash() ([sha256.Size]byte, error) {
	var hash [sha256.Size]byte
	_, err := rand.Read(hash[:])
	return hash, err
}
