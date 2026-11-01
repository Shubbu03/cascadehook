package mailoutbox

import (
	"crypto/aes"
	"crypto/cipher"
	"fmt"

	"github.com/google/uuid"
)

type Cipher struct{ current, previous cipher.AEAD }

func NewCipher(current, previous []byte) (*Cipher, error) {
	build := func(key []byte) (cipher.AEAD, error) {
		if len(key) != 32 {
			return nil, fmt.Errorf("email encryption key must contain 32 bytes")
		}
		block, err := aes.NewCipher(key)
		if err != nil {
			return nil, err
		}
		return cipher.NewGCMWithRandomNonce(block)
	}
	aead, err := build(current)
	if err != nil {
		return nil, err
	}
	result := &Cipher{current: aead}
	if len(previous) > 0 {
		result.previous, err = build(previous)
	}
	return result, err
}

func emailIdentity(job Job) []byte {
	return []byte("cascadehook.email.v1:" + job.OrganizationID.String() + ":" + job.ID.String())
}

func (c *Cipher) Encrypt(job Job, body []byte) []byte {
	return c.current.Seal([]byte{1}, nil, body, emailIdentity(job))
}

func (c *Cipher) Decrypt(job Job) ([]byte, error) {
	if job.ID == uuid.Nil || len(job.Payload) < 2 || job.Payload[0] != 1 {
		return nil, fmt.Errorf("invalid email payload")
	}
	body, err := c.current.Open(nil, nil, job.Payload[1:], emailIdentity(job))
	if err != nil && c.previous != nil {
		body, err = c.previous.Open(nil, nil, job.Payload[1:], emailIdentity(job))
	}
	if err != nil {
		return nil, fmt.Errorf("cannot decrypt email payload")
	}
	return body, nil
}
