package mailoutbox

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
)

type ProviderError struct {
	Status     int
	RetryAfter time.Duration
	Code       string
}

func (e *ProviderError) Error() string {
	return fmt.Sprintf("email provider: status=%d code=%s", e.Status, e.Code)
}

type Provider struct {
	key  string
	http *http.Client
}

func NewProvider(key string) *Provider {
	return &Provider{key: key, http: &http.Client{
		Timeout:       10 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
		Transport: &http.Transport{
			TLSClientConfig:     &tls.Config{MinVersion: tls.VersionTLS12},
			TLSHandshakeTimeout: 3 * time.Second, ResponseHeaderTimeout: 8 * time.Second,
			MaxConnsPerHost: 2, MaxIdleConns: 2, IdleConnTimeout: 30 * time.Second,
			MaxResponseHeaderBytes: 16 << 10, ForceAttemptHTTP2: true,
		},
	}}
}

func (p *Provider) Close() { p.http.CloseIdleConnections() }

// The encrypted request body is immutable across automatic retries. Resend's
// 24-hour idempotency window is longer than the worker's 23-hour retry horizon.
func (p *Provider) Send(ctx context.Context, id uuid.UUID, body []byte) (string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return "", &ProviderError{Code: "invalid_request"}
	}
	request.Header.Set("Authorization", "Bearer "+p.key)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "invitation-email/"+id.String())
	response, err := p.http.Do(request)
	if err != nil {
		return "", &ProviderError{Code: "network_error"}
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, (64<<10)+1))
	if err != nil || len(data) > 64<<10 {
		return "", &ProviderError{Code: "invalid_response"}
	}
	if response.StatusCode >= 200 && response.StatusCode < 300 {
		var receipt struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(data, &receipt) == nil && receipt.ID != "" {
			return receipt.ID, nil
		}
		return "", &ProviderError{Code: "invalid_response"}
	}
	wait := time.Duration(0)
	if seconds, err := strconv.Atoi(response.Header.Get("Retry-After")); err == nil && seconds > 0 {
		wait = time.Duration(min(seconds, 86400)) * time.Second
	} else if at, err := http.ParseTime(response.Header.Get("Retry-After")); err == nil {
		wait = min(max(time.Until(at), 0), 24*time.Hour)
	}
	return "", &ProviderError{Status: response.StatusCode, Code: "send_failed", RetryAfter: wait}
}
