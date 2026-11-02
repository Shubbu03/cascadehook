package billing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Event struct {
	ID        string
	Type      string    `json:"type"`
	Timestamp time.Time `json:"timestamp"`
	Data      struct {
		SubscriptionID string            `json:"subscription_id"`
		RefundID       string            `json:"refund_id"`
		PaymentID      string            `json:"payment_id"`
		Metadata       map[string]string `json:"metadata"`
	} `json:"data"`
}

func (c Config) VerifyWebhook(body []byte, headers http.Header, now time.Time) (Event, error) {
	invalid := fmt.Errorf("invalid billing webhook")
	id, stamp := headers.Get("webhook-id"), headers.Get("webhook-timestamp")
	seconds, err := strconv.ParseInt(stamp, 10, 64)
	if err != nil || id == "" || len(id) > 255 || now.Sub(time.Unix(seconds, 0)).Abs() > 5*time.Minute {
		return Event{}, invalid
	}
	key, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(c.WebhookKey, "whsec_"))
	if err != nil || len(key) < 16 {
		return Event{}, invalid
	}
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(id + "." + stamp + "."))
	_, _ = mac.Write(body)
	matched := false
	for _, signature := range strings.Fields(headers.Get("webhook-signature")) {
		version, value, ok := strings.Cut(signature, ",")
		if !ok || version != "v1" {
			continue
		}
		decoded, err := base64.StdEncoding.DecodeString(value)
		if err == nil && hmac.Equal(decoded, mac.Sum(nil)) {
			matched = true
		}
	}
	var event Event
	if !matched || json.Unmarshal(body, &event) != nil || event.Timestamp.IsZero() {
		return Event{}, invalid
	}
	event.ID = id
	if strings.HasPrefix(event.Type, "subscription.") && !safeID(event.Data.SubscriptionID) {
		return Event{}, invalid
	}
	return event, nil
}
