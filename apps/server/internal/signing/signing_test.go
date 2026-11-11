package signing

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func expectedSignature(secret Secret, message string) string {
	mac := hmac.New(sha256.New, secret.key[:])
	mac.Write([]byte(message))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func TestHeadersSignIDTimestampBody(t *testing.T) {
	secret, err := NewSecret()
	if err != nil {
		t.Fatal(err)
	}
	id := uuid.New()
	at := time.Unix(1_800_000_000, 999)
	body := []byte(`{"type":"order.created"}`)
	headers := secret.Headers(id, body, at, nil)
	if headers.Get("Webhook-Id") != id.String() || headers.Get("Webhook-Timestamp") != "1800000000" {
		t.Fatalf("unexpected identity headers: %v", headers)
	}
	want := "v1," + expectedSignature(secret, id.String()+".1800000000."+string(body))
	if got := headers.Get("Webhook-Signature"); got != want {
		t.Fatalf("signature %q, want %q", got, want)
	}
}

func TestHeadersIncludePreviousSecretDuringRotation(t *testing.T) {
	current, _ := NewSecret()
	previous, _ := NewSecret()
	id := uuid.New()
	body := []byte("{}")
	at := time.Unix(1_800_000_000, 0)
	signatures := strings.Split(current.Headers(id, body, at, &previous).Get("Webhook-Signature"), " ")
	message := id.String() + ".1800000000.{}"
	if len(signatures) != 2 || signatures[0] != "v1,"+expectedSignature(current, message) ||
		signatures[1] != "v1,"+expectedSignature(previous, message) {
		t.Fatalf("unexpected rotation signatures: %v", signatures)
	}
}

func TestVerificationProof(t *testing.T) {
	secret, _ := NewSecret()
	other, _ := NewSecret()
	id := uuid.New()
	proof := expectedSignature(secret, "cascadehook.verify.v1."+id.String()+".challenge")
	if !secret.MatchesVerificationProof(id, "challenge", proof) {
		t.Fatal("valid proof rejected")
	}
	if secret.MatchesVerificationProof(id, "other", proof) || secret.MatchesVerificationProof(uuid.New(), "challenge", proof) ||
		other.MatchesVerificationProof(id, "challenge", proof) || secret.MatchesVerificationProof(id, "challenge", "") {
		t.Fatal("proof accepted for the wrong challenge, endpoint, or secret")
	}
}

func TestSecretNeverFormatsItsKey(t *testing.T) {
	secret, _ := NewSecret()
	raw := strings.TrimPrefix(secret.Token(), "whsec_")
	if !strings.HasPrefix(secret.Token(), "whsec_") || raw == "" {
		t.Fatalf("unexpected token shape")
	}
	for _, formatted := range []string{fmt.Sprint(secret), fmt.Sprintf("%v %+v %#v %s", secret, secret, secret, secret), secret.LogValue().String()} {
		if strings.Contains(formatted, raw) || !strings.Contains(formatted, "redacted") {
			t.Fatalf("secret leaked through formatting: %q", formatted)
		}
	}
}

func TestVaultRoundTripAndBinding(t *testing.T) {
	key := bytes.Repeat([]byte{1}, 32)
	vault, err := NewVaultWithPrevious(key, nil)
	if err != nil {
		t.Fatal(err)
	}
	secret, _ := NewSecret()
	project, endpoint := uuid.New(), uuid.New()
	encrypted := vault.Encrypt(project, endpoint, secret)
	if bytes.Contains(encrypted, secret.key[:]) {
		t.Fatal("ciphertext contains the raw key")
	}
	decrypted, err := vault.Decrypt(project, endpoint, encrypted)
	if err != nil || decrypted.key != secret.key {
		t.Fatalf("round trip failed: %v", err)
	}
	if _, err := vault.Decrypt(project, uuid.New(), encrypted); err == nil {
		t.Fatal("ciphertext decrypted for another endpoint")
	}
	if _, err := vault.Decrypt(uuid.New(), endpoint, encrypted); err == nil {
		t.Fatal("ciphertext decrypted for another project")
	}
	tampered := bytes.Clone(encrypted)
	tampered[len(tampered)-1] ^= 1
	if _, err := vault.Decrypt(project, endpoint, tampered); err == nil {
		t.Fatal("tampered ciphertext decrypted")
	}
}

func TestVaultKeyRotation(t *testing.T) {
	oldKey, newKey := bytes.Repeat([]byte{1}, 32), bytes.Repeat([]byte{2}, 32)
	oldVault, err := NewVaultWithPrevious(oldKey, nil)
	if err != nil {
		t.Fatal(err)
	}
	rotating, err := NewVaultWithPrevious(newKey, oldKey)
	if err != nil {
		t.Fatal(err)
	}
	newOnly, err := NewVaultWithPrevious(newKey, nil)
	if err != nil {
		t.Fatal(err)
	}
	secret, _ := NewSecret()
	project, endpoint := uuid.New(), uuid.New()
	encrypted := oldVault.Encrypt(project, endpoint, secret)
	if _, err := newOnly.Decrypt(project, endpoint, encrypted); err == nil {
		t.Fatal("new key alone decrypted old ciphertext")
	}
	if decrypted, err := rotating.Decrypt(project, endpoint, encrypted); err != nil || decrypted.key != secret.key {
		t.Fatalf("previous key was not accepted: %v", err)
	}
	rewrapped, changed, err := rotating.Rewrap(project, endpoint, encrypted)
	if err != nil || !changed {
		t.Fatalf("rewrap: changed=%v err=%v", changed, err)
	}
	if decrypted, err := newOnly.Decrypt(project, endpoint, rewrapped); err != nil || decrypted.key != secret.key {
		t.Fatalf("rewrapped ciphertext not readable with the new key: %v", err)
	}
	if _, changed, err := rotating.Rewrap(project, endpoint, rewrapped); err != nil || changed {
		t.Fatalf("current ciphertext was rewrapped again: changed=%v err=%v", changed, err)
	}
}
