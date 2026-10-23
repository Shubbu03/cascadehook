package clerk

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

var ErrInvalidWebhook = errors.New("invalid Clerk webhook")

type Webhook struct{ keys [][]byte }

type LifecycleEvent struct {
	MessageID string
	Type      string
	ObjectID  string
	BodyHash  [sha256.Size]byte
}

// Accept the current and previous endpoint secrets during a controlled rotation.
func NewWebhook(secrets []string) (*Webhook, error) {
	if len(secrets) == 0 {
		return nil, nil
	}
	if len(secrets) > 2 {
		return nil, fmt.Errorf("configure at most two Clerk webhook signing secrets")
	}
	keys := make([][]byte, 0, len(secrets))
	for _, secret := range secrets {
		key, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
		if err != nil || len(key) < 24 || len(key) > 64 || !strings.HasPrefix(secret, "whsec_") {
			return nil, fmt.Errorf("CLERK_WEBHOOK_SIGNING_SECRETS must contain valid whsec_ endpoint secrets")
		}
		keys = append(keys, key)
	}
	return &Webhook{keys: keys}, nil
}

func (verifier *Webhook) Verify(body []byte, headers http.Header, now time.Time) (LifecycleEvent, error) {
	values := make([]string, 0, 3)
	for _, name := range []string{"svix-id", "svix-timestamp", "svix-signature"} {
		fields := headers.Values(name)
		if len(fields) != 1 || len(fields[0]) == 0 || len(fields[0]) > 2048 {
			return LifecycleEvent{}, ErrInvalidWebhook
		}
		values = append(values, fields[0])
	}
	id, timestamp, signatures := values[0], values[1], strings.Fields(values[2])
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || len(id) > 255 || len(signatures) > 10 {
		return LifecycleEvent{}, ErrInvalidWebhook
	}
	at := time.Unix(seconds, 0)
	if at.Before(now.Add(-5*time.Minute)) || at.After(now.Add(5*time.Minute)) {
		return LifecycleEvent{}, ErrInvalidWebhook
	}
	valid := false
	for _, key := range verifier.keys {
		mac := hmac.New(sha256.New, key)
		_, _ = mac.Write([]byte(id + "." + timestamp + "."))
		_, _ = mac.Write(body)
		for _, signature := range signatures {
			if !strings.HasPrefix(signature, "v1,") {
				continue
			}
			decoded, decodeErr := base64.StdEncoding.DecodeString(strings.TrimPrefix(signature, "v1,"))
			if decodeErr == nil && hmac.Equal(decoded, mac.Sum(nil)) {
				valid = true
			}
		}
	}
	if !valid {
		return LifecycleEvent{}, ErrInvalidWebhook
	}
	var envelope struct {
		Type string `json:"type"`
		Data struct {
			ID      string `json:"id"`
			Deleted bool   `json:"deleted"`
		} `json:"data"`
	}
	if json.Unmarshal(body, &envelope) != nil {
		return LifecycleEvent{}, ErrInvalidWebhook
	}
	switch envelope.Type {
	case "user.deleted":
		if !validUserID(envelope.Data.ID) || !envelope.Data.Deleted {
			return LifecycleEvent{}, ErrInvalidWebhook
		}
	case "session.ended", "session.revoked", "session.removed":
		if !strings.HasPrefix(envelope.Data.ID, "sess_") || len(envelope.Data.ID) > 255 {
			return LifecycleEvent{}, ErrInvalidWebhook
		}
	default:
		return LifecycleEvent{}, nil
	}
	return LifecycleEvent{
		MessageID: id, Type: envelope.Type, ObjectID: envelope.Data.ID, BodyHash: sha256.Sum256(body),
	}, nil
}
