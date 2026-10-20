package auth

import (
	"crypto/sha256"
	"errors"
	"regexp"

	"github.com/google/uuid"
)

var ErrInvalidAPIKey = errors.New("invalid API key")

var apiKeyPattern = regexp.MustCompile(`^ch_(dev|live)_[0-9a-f]{64}$`)

type Principal struct {
	ProjectID uuid.UUID
	APIKeyID  uuid.UUID
}

func DigestAPIKey(token string) ([sha256.Size]byte, error) {
	if !apiKeyPattern.MatchString(token) {
		return [sha256.Size]byte{}, ErrInvalidAPIKey
	}
	return sha256.Sum256([]byte(token)), nil
}
