package mailoutbox

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Webhook struct{ key []byte }

func NewWebhook(secret string) (*Webhook, error) {
	if secret == "" {
		return nil, nil
	}
	key, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
	if err != nil || len(key) < 16 || !strings.HasPrefix(secret, "whsec_") {
		return nil, fmt.Errorf("RESEND_WEBHOOK_SECRET must be a valid whsec_ signing secret")
	}
	return &Webhook{key: key}, nil
}

func (w *Webhook) Verify(body []byte, headers http.Header, now time.Time) (Event, error) {
	invalid := fmt.Errorf("invalid email webhook")
	id := headers.Get("svix-id")
	stamp := headers.Get("svix-timestamp")
	seconds, err := strconv.ParseInt(stamp, 10, 64)
	if err != nil || id == "" || len(id) > 255 || now.Sub(time.Unix(seconds, 0)).Abs() > 5*time.Minute {
		return Event{}, invalid
	}
	mac := hmac.New(sha256.New, w.key)
	_, _ = mac.Write([]byte(id + "." + stamp + "."))
	_, _ = mac.Write(body)
	matched := false
	for _, signature := range strings.Fields(headers.Get("svix-signature")) {
		version, value, ok := strings.Cut(signature, ",")
		if !ok || version != "v1" {
			continue
		}
		sum, err := base64.StdEncoding.DecodeString(value)
		if err == nil && hmac.Equal(sum, mac.Sum(nil)) {
			matched = true
		}
	}
	if !matched {
		return Event{}, invalid
	}
	var payload struct {
		Type      string    `json:"type"`
		CreatedAt time.Time `json:"created_at"`
		Data      struct {
			ID   string            `json:"email_id"`
			Tags map[string]string `json:"tags"`
		} `json:"data"`
	}
	if json.Unmarshal(body, &payload) != nil {
		return Event{}, invalid
	}
	states := map[string]string{
		"email.sent": "sent", "email.delivered": "delivered", "email.failed": "failed",
		"email.bounced": "bounced", "email.complained": "complained", "email.suppressed": "suppressed",
	}
	state, relevant := states[payload.Type]
	if !relevant {
		return Event{}, nil
	}
	if payload.Data.ID == "" || len(payload.Data.ID) > 255 || payload.CreatedAt.IsZero() {
		return Event{}, invalid
	}
	jobID := uuid.Nil
	if value := payload.Data.Tags["cascadehook_job"]; value != "" {
		jobID, err = uuid.Parse(value)
		if err != nil {
			return Event{}, invalid
		}
	}
	return Event{ID: id, JobID: jobID, MessageID: payload.Data.ID, State: state, OccurredAt: payload.CreatedAt}, nil
}
