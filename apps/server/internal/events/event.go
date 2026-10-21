package events

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

const MaxPayloadSize = 256 << 10

var (
	ErrInvalidEvent          = errors.New("event must contain exactly type and data fields")
	ErrInvalidType           = errors.New("invalid event type")
	ErrPayloadTooLarge       = errors.New("event body exceeds 256 KiB")
	ErrInvalidIdempotencyKey = errors.New("idempotency key must contain 1 to 255 visible ASCII characters")
	ErrIdempotencyConflict   = errors.New("idempotency key was already used with a different request body")
	eventTypePattern         = regexp.MustCompile(`^[a-z0-9][a-z0-9_.-]{2,127}$`)
)

// Accepted is the original acceptance receipt, independent of later delivery
// state changes. Replayed is exposed through a response header only.
type Accepted struct {
	ID            uuid.UUID `json:"id"`
	Type          string    `json:"type"`
	CreatedAt     time.Time `json:"created_at"`
	DeliveryCount int       `json:"delivery_count"`
	Replayed      bool      `json:"-"`
}

func ValidType(name string) bool {
	return eventTypePattern.MatchString(name)
}

// ValidatePublication validates the envelope without reserializing its bytes.
// Data may be any JSON value, including null. Duplicate envelope keys are
// rejected to keep routing consistent with the bytes receivers will see.
func ValidatePublication(body []byte, key string) (string, error) {
	if len(key) < 1 || len(key) > 255 {
		return "", ErrInvalidIdempotencyKey
	}
	for i := range key {
		if key[i] < '!' || key[i] > '~' {
			return "", ErrInvalidIdempotencyKey
		}
	}
	if len(body) > MaxPayloadSize {
		return "", ErrPayloadTooLarge
	}
	if !utf8.Valid(body) {
		return "", ErrInvalidEvent
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	start, err := decoder.Token()
	if err != nil || start != json.Delim('{') {
		return "", ErrInvalidEvent
	}
	var eventType string
	var seenType, seenData bool
	for decoder.More() {
		field, err := decoder.Token()
		if err != nil {
			return "", ErrInvalidEvent
		}
		switch field {
		case "type":
			if seenType || decoder.Decode(&eventType) != nil {
				return "", ErrInvalidEvent
			}
			seenType = true
		case "data":
			var data json.RawMessage
			if seenData || decoder.Decode(&data) != nil {
				return "", ErrInvalidEvent
			}
			seenData = true
		default:
			return "", ErrInvalidEvent
		}
	}
	if end, err := decoder.Token(); err != nil || end != json.Delim('}') {
		return "", ErrInvalidEvent
	}
	var extra json.RawMessage
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) || !seenType || !seenData {
		return "", ErrInvalidEvent
	}
	if !ValidType(eventType) {
		return "", ErrInvalidType
	}
	return eventType, nil
}
