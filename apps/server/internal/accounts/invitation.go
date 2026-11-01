package accounts

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
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

func NewInvitationToken() (string, [sha256.Size]byte, error) {
	var random [32]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", [sha256.Size]byte{}, err
	}
	token := "chi_" + hex.EncodeToString(random[:])
	return token, sha256.Sum256([]byte(token)), nil
}

func InvitationDigest(token string) ([sha256.Size]byte, error) {
	if len(token) != 68 || !strings.HasPrefix(token, "chi_") {
		return [sha256.Size]byte{}, ErrInvitationInvalid
	}
	if _, err := hex.DecodeString(token[4:]); err != nil {
		return [sha256.Size]byte{}, ErrInvitationInvalid
	}
	return sha256.Sum256([]byte(token)), nil
}
