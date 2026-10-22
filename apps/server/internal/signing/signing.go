// Package signing creates endpoint credentials, signs exact request bytes,
// and validates proofs that a receiver knows its configured credential.
package signing

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
)

const (
	SecretSize    = 32
	RotationGrace = 5 * time.Minute
)

// Secret keeps raw key bytes out of JSON and ordinary formatted log output.
type Secret struct{ key [SecretSize]byte }

func (Secret) String() string { return "[redacted signing secret]" }

func (Secret) GoString() string { return "[redacted signing secret]" }

func (Secret) LogValue() slog.Value { return slog.StringValue("[redacted signing secret]") }

func NewSecret() (Secret, error) {
	var secret Secret
	if _, err := rand.Read(secret.key[:]); err != nil {
		return Secret{}, fmt.Errorf("generate signing secret: %w", err)
	}
	return secret, nil
}

// Token is disclosed only by the authenticated secret-provision/rotation API.
func (secret Secret) Token() string {
	return "whsec_" + base64.StdEncoding.EncodeToString(secret.key[:])
}

// Headers signs deliveryID.timestamp.rawBody. A previous key contributes a
// second v1 signature during rotation; receivers may accept either signature.
func (secret Secret) Headers(id uuid.UUID, body []byte, at time.Time, previous *Secret) http.Header {
	timestamp := strconv.FormatInt(at.Unix(), 10)
	message := append([]byte(id.String()+"."+timestamp+"."), body...)
	signature := "v1," + secret.mac(message)
	if previous != nil {
		signature += " v1," + previous.mac(message)
	}
	headers := make(http.Header)
	headers.Set("Webhook-Id", id.String())
	headers.Set("Webhook-Timestamp", timestamp)
	headers.Set("Webhook-Signature", signature)
	return headers
}

func (secret Secret) MatchesVerificationProof(id uuid.UUID, challenge, proof string) bool {
	expected := secret.mac([]byte("cascadehook.verify.v1." + id.String() + "." + challenge))
	return hmac.Equal([]byte(expected), []byte(proof))
}

func (secret Secret) mac(message []byte) string {
	mac := hmac.New(sha256.New, secret.key[:])
	_, _ = mac.Write(message)
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}
