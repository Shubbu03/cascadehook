package endpoints

import (
	"errors"
	"time"
)

var (
	ErrSigningSecretRequired   = errors.New("provision a signing secret before verifying or enabling the endpoint")
	ErrRotationInProgress      = errors.New("previous signing secret is still within its rotation grace period")
	ErrVerificationRateLimited = errors.New("endpoint verification may be attempted once every 30 seconds")
	ErrVerificationChanged     = errors.New("endpoint configuration or verification attempt changed during the challenge")
)

const VerificationCooldown = 30 * time.Second

type SecretRotation struct {
	UpdatedAt               time.Time  `json:"updated_at"`
	PreviousSecretExpiresAt *time.Time `json:"previous_secret_expires_at"`
}

// VerificationSnapshot is internal dispatch data, never an API response.
// Version changes on every challenge, URL change, and secret rotation, so a
// response to an older URL or credential cannot verify the new configuration.
type VerificationSnapshot struct {
	URL                   string `json:"-"`
	Version               int64  `json:"-"`
	SigningSecret         []byte `json:"-"`
	PreviousSigningSecret []byte `json:"-"`
}
