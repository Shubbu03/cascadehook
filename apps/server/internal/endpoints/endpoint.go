package endpoints

import (
	"errors"
	"net/netip"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

var (
	ErrNotFound             = errors.New("endpoint not found")
	ErrInvalidURL           = errors.New("endpoint URL must be HTTPS without credentials or a fragment")
	ErrInvalidEventTypes    = errors.New("event types must be 1 to 100 unique exact-match names")
	ErrVerificationRequired = errors.New("endpoint ownership verification is required before enabling")
	eventTypePattern        = regexp.MustCompile(`^[a-z0-9][a-z0-9_.-]{2,127}$`)
)

type Endpoint struct {
	ID         uuid.UUID  `json:"id"`
	ProjectID  uuid.UUID  `json:"project_id"`
	URL        string     `json:"url"`
	Enabled    bool       `json:"enabled"`
	VerifiedAt *time.Time `json:"verified_at"`
	EventTypes []string   `json:"event_types"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

type Registration struct {
	URL        string
	EventTypes []string
}

// Update replaces only fields explicitly supplied by the caller.
type Update struct {
	URL        *string
	Enabled    *bool
	EventTypes *[]string
}

type Cursor struct {
	CreatedAt time.Time `json:"created_at"`
	ID        uuid.UUID `json:"id"`
}

type ListOptions struct {
	Limit     int
	Before    *Cursor
	Enabled   *bool
	EventType string
}

// NormalizeURL checks syntax only. Registration performs no network request;
// the delivery dialer must independently validate resolved IP addresses.
func NormalizeURL(raw string) (string, error) {
	if !utf8.ValidString(raw) || len(raw) > 2048 || strings.TrimSpace(raw) != raw {
		return "", ErrInvalidURL
	}
	u, err := url.Parse(raw)
	if err != nil || !strings.EqualFold(u.Scheme, "https") || u.Hostname() == "" || u.User != nil || u.Opaque != "" || strings.Contains(raw, "#") {
		return "", ErrInvalidURL
	}
	if strings.ContainsAny(u.Hostname(), " \t\r\n%") || strings.HasSuffix(u.Host, ":") {
		return "", ErrInvalidURL
	}
	if strings.HasPrefix(u.Host, "[") {
		address, err := netip.ParseAddr(u.Hostname())
		if err != nil || !address.Is6() {
			return "", ErrInvalidURL
		}
	} else if strings.Contains(u.Hostname(), ":") {
		return "", ErrInvalidURL
	}
	if port := u.Port(); port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return "", ErrInvalidURL
		}
	}
	u.Scheme = "https"
	result := u.String()
	if len(result) > 2048 {
		return "", ErrInvalidURL
	}
	return result, nil
}

func ValidEventType(name string) bool {
	return eventTypePattern.MatchString(name)
}

func NormalizeEventTypes(types []string) ([]string, error) {
	if len(types) == 0 || len(types) > 100 {
		return nil, ErrInvalidEventTypes
	}
	result := slices.Clone(types)
	slices.Sort(result)
	for i, name := range result {
		if !ValidEventType(name) || (i > 0 && name == result[i-1]) {
			return nil, ErrInvalidEventTypes
		}
	}
	return result, nil
}
