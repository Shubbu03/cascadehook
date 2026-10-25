package signing

import (
	"encoding/json"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/google/uuid"
)

// The downloadable receivers use this same public, deterministic test vector.
func TestReceiverContractVector(t *testing.T) {
	data, err := os.ReadFile("testdata/signing-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Secret    string `json:"secret"`
		ID        string `json:"id"`
		Timestamp string `json:"timestamp"`
		Body      string `json:"body"`
		Signature string `json:"signature"`
		Challenge string `json:"challenge"`
		Proof     string `json:"proof"`
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	var key [SecretSize]byte
	for i := range key {
		key[i] = byte(i)
	}
	secret := Secret{key: key}
	id, err := uuid.Parse(fixture.ID)
	if err != nil {
		t.Fatal(err)
	}
	seconds, err := strconv.ParseInt(fixture.Timestamp, 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	if secret.Token() != fixture.Secret {
		t.Fatal("test credential differs from fixture")
	}
	headers := secret.Headers(id, []byte(fixture.Body), time.Unix(seconds, 0), nil)
	if headers.Get("Webhook-Signature") != fixture.Signature {
		t.Fatal("signature contract differs from receiver fixture")
	}
	if headers.Get("Webhook-Id") != fixture.ID || headers.Get("Webhook-Timestamp") != fixture.Timestamp {
		t.Fatal("signed headers differ from fixture")
	}
	if !secret.MatchesVerificationProof(id, fixture.Challenge, fixture.Proof) {
		t.Fatal("proof contract differs from receiver fixture")
	}
}
