package signing

import (
	"crypto/aes"
	"crypto/cipher"
	"fmt"

	"github.com/google/uuid"
)

const ciphertextVersion = 1

// Vault encrypts each secret with a fresh nonce and authenticated tenant/endpoint
// identity. Copying ciphertext between endpoints or projects fails decryption.
type Vault struct{ aead cipher.AEAD }

func NewVault(key []byte) (*Vault, error) {
	if len(key) != SecretSize {
		return nil, fmt.Errorf("signing encryption key must contain 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("initialize signing encryption: %w", err)
	}
	aead, err := cipher.NewGCMWithRandomNonce(block)
	if err != nil {
		return nil, fmt.Errorf("initialize signing encryption: %w", err)
	}
	return &Vault{aead: aead}, nil
}

func (vault *Vault) Encrypt(projectID, endpointID uuid.UUID, secret Secret) []byte {
	// #nosec G407 -- NewGCMWithRandomNonce generates and prepends a fresh nonce; it requires nil here.
	return vault.aead.Seal(
		[]byte{ciphertextVersion},
		nil,
		secret.key[:],
		secretIdentity(projectID, endpointID),
	)
}

func (vault *Vault) Decrypt(projectID, endpointID uuid.UUID, encrypted []byte) (Secret, error) {
	if len(encrypted) != 1+SecretSize+vault.aead.Overhead() || encrypted[0] != ciphertextVersion {
		return Secret{}, fmt.Errorf("invalid encrypted signing secret")
	}
	plaintext, err := vault.aead.Open(
		nil,
		nil,
		encrypted[1:],
		secretIdentity(projectID, endpointID),
	)
	if err != nil || len(plaintext) != SecretSize {
		return Secret{}, fmt.Errorf("cannot decrypt signing secret")
	}
	var secret Secret
	copy(secret.key[:], plaintext)
	clear(plaintext)
	return secret, nil
}

func secretIdentity(projectID, endpointID uuid.UUID) []byte {
	return []byte("cascadehook.signing.v1:" + projectID.String() + ":" + endpointID.String())
}
