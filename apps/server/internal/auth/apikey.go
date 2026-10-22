package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
)

// GeneratedAPIKey contains a credential that must only be disclosed at creation.
// Persistence receives the hash and display prefix, never the token.
type GeneratedAPIKey struct {
	Token  string            `json:"-"`
	Prefix string            `json:"prefix"`
	Hash   [sha256.Size]byte `json:"-"`
}

func (GeneratedAPIKey) String() string { return "[redacted API key]" }

func (GeneratedAPIKey) GoString() string { return "[redacted API key]" }

func (GeneratedAPIKey) LogValue() slog.Value { return slog.StringValue("[redacted API key]") }

// NewDevelopmentAPIKey generates a development credential with 256 bits of
// random entropy. The display prefix exposes only the first 12 hex characters;
// it is not an authentication lookup key. Hash the full token for lookup.
func NewDevelopmentAPIKey() (GeneratedAPIKey, error) {
	return NewAPIKey(EnvironmentDevelopment)
}

// NewAPIKey never accepts a caller-chosen secret. Environment is a display
// label; all V1 credentials have the same project scope.
func NewAPIKey(environment KeyEnvironment) (GeneratedAPIKey, error) {
	if !ValidKeyEnvironment(environment) {
		return GeneratedAPIKey{}, ErrInvalidKeyEnvironment
	}
	var secret [32]byte
	if _, err := rand.Read(secret[:]); err != nil {
		return GeneratedAPIKey{}, fmt.Errorf("generate API key: %w", err)
	}
	encoded := hex.EncodeToString(secret[:])
	prefix := "ch_" + string(environment) + "_"
	token := prefix + encoded
	return GeneratedAPIKey{
		Token:  token,
		Prefix: prefix + encoded[:12],
		Hash:   sha256.Sum256([]byte(token)),
	}, nil
}
