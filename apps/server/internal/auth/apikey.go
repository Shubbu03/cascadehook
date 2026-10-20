package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// GeneratedAPIKey contains a credential that must only be disclosed at creation.
// Persistence receives the hash and display prefix, never the token.
type GeneratedAPIKey struct {
	Token  string            `json:"-"`
	Prefix string            `json:"prefix"`
	Hash   [sha256.Size]byte `json:"-"`
}

// NewDevelopmentAPIKey generates a development credential with 256 bits of
// random entropy. The display prefix exposes only the first 12 hex characters;
// it is not an authentication lookup key. Hash the full token for lookup.
func NewDevelopmentAPIKey() (GeneratedAPIKey, error) {
	var secret [32]byte
	if _, err := rand.Read(secret[:]); err != nil {
		return GeneratedAPIKey{}, fmt.Errorf("generate API key: %w", err)
	}
	encoded := hex.EncodeToString(secret[:])
	token := "ch_dev_" + encoded
	return GeneratedAPIKey{
		Token:  token,
		Prefix: "ch_dev_" + encoded[:12],
		Hash:   sha256.Sum256([]byte(token)),
	}, nil
}
