package signing

import (
	"bytes"
	"testing"

	"github.com/google/uuid"
)

func TestVaultUsesFreshNoncesAndBindsIdentity(t *testing.T) {
	key := bytes.Repeat([]byte{1}, SecretSize)
	vault, err := NewVault(key)
	if err != nil {
		t.Fatal(err)
	}
	secret, err := NewSecret()
	if err != nil {
		t.Fatal(err)
	}
	projectID, endpointID := uuid.New(), uuid.New()
	ciphertext := vault.Encrypt(projectID, endpointID, secret)
	if bytes.Equal(ciphertext, vault.Encrypt(projectID, endpointID, secret)) {
		t.Fatal("repeated encryption reused a nonce")
	}
	decoded, err := vault.Decrypt(projectID, endpointID, ciphertext)
	if err != nil || decoded != secret {
		t.Fatal("encrypted secret did not round trip")
	}
	identities := []struct {
		projectID, endpointID uuid.UUID
	}{
		{projectID: uuid.New(), endpointID: endpointID},
		{projectID: projectID, endpointID: uuid.New()},
	}
	for _, identity := range identities {
		if _, err := vault.Decrypt(identity.projectID, identity.endpointID, ciphertext); err == nil {
			t.Error("ciphertext was accepted for another project or endpoint")
		}
	}
	tampered := bytes.Clone(ciphertext)
	tampered[len(tampered)-1] ^= 1
	if _, err := vault.Decrypt(projectID, endpointID, tampered); err == nil {
		t.Error("tampered ciphertext was accepted")
	}
	otherVault, err := NewVault(bytes.Repeat([]byte{2}, SecretSize))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := otherVault.Decrypt(projectID, endpointID, ciphertext); err == nil {
		t.Error("ciphertext was accepted with a different encryption key")
	}
}
