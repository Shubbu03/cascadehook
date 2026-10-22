// Package delivery owns outbound HTTPS transport for verification and delivery.
package delivery

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"cascadehook/internal/endpoints"
	"cascadehook/internal/events"
)

const (
	connectTimeout  = 5 * time.Second
	requestTimeout  = 30 * time.Second
	maxResponseBody = 4 << 10
)

// Client is safe for concurrent use. Its transport is private so callers cannot
// accidentally bypass IP validation, certificate checks, or redirect policy.
type Client struct {
	transport *http.Transport
	slots     chan struct{}
}

// Response.Body is untrusted and may contain sensitive data. Consumers must not
// persist or log it verbatim. A nonzero StatusCode remains available even when
// reading the response body fails; a body-read error alone must not retry an
// otherwise successful delivery.
type Response struct {
	StatusCode int
	RetryAfter string
	Body       []byte `json:"-"`
	Truncated  bool
}

func (response Response) LogValue() slog.Value {
	return slog.GroupValue(slog.Int("status_code", response.StatusCode), slog.Bool("body_truncated", response.Truncated))
}

func NewClient() *Client {
	transport := &http.Transport{
		Proxy:                  nil,
		DialContext:            dialPublic,
		TLSClientConfig:        &tls.Config{MinVersion: tls.VersionTLS12},
		TLSHandshakeTimeout:    5 * time.Second,
		ResponseHeaderTimeout:  25 * time.Second,
		MaxResponseHeaderBytes: 32 << 10,
		MaxConnsPerHost:        4,
		MaxIdleConns:           64,
		MaxIdleConnsPerHost:    2,
		IdleConnTimeout:        60 * time.Second,
		DisableCompression:     true,
	}
	return &Client{slots: make(chan struct{}, 32), transport: transport}
}

func (c *Client) CloseIdleConnections() {
	c.transport.CloseIdleConnections()
}

// PostJSON sends exactly the supplied body bytes and generated webhook headers.
// It ignores proxy environment variables and never follows redirects or cookies.
func (c *Client) PostJSON(ctx context.Context, address string, body []byte, headers http.Header) (Response, error) {
	address, err := endpoints.NormalizeURL(address)
	if err != nil {
		return Response{}, ErrUnsafeDestination
	}
	if len(body) == 0 || len(body) > events.MaxPayloadSize {
		return Response{}, fmt.Errorf("outbound body must contain 1 to %d bytes", events.MaxPayloadSize)
	}
	// Bound all outbound calls, including verification requests arriving on
	// different hosts. Waiting for capacity is part of the total deadline.
	ctx, cancel := context.WithTimeout(ctx, requestTimeout)
	defer cancel()
	select {
	case c.slots <- struct{}{}:
		defer func() { <-c.slots }()
	case <-ctx.Done():
		return Response{}, requestError{ctx.Err()}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, address, bytes.NewReader(body))
	if err != nil {
		return Response{}, requestError{err}
	}
	// Prevent Transport from replaying a request body internally. Delivery
	// retries belong to the queue and its append-only attempt records.
	req.GetBody = nil
	for _, name := range []string{"Webhook-Id", "Webhook-Timestamp", "Webhook-Signature"} {
		value := headers.Get(name)
		if value == "" {
			return Response{}, fmt.Errorf("outbound webhook signature headers are required")
		}
		req.Header.Set(name, value)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Encoding", "identity")
	req.Header.Set("User-Agent", "Cascadehook/1")
	// RoundTrip never follows or even parses Location. This preserves a 3xx
	// outcome even when its Location is malformed; Client.Do would convert
	// that case into an error before consulting its redirect callback.
	response, err := c.transport.RoundTrip(req)
	if err != nil {
		return Response{}, requestError{err}
	}
	defer response.Body.Close()
	result := Response{StatusCode: response.StatusCode, RetryAfter: response.Header.Get("Retry-After")}
	// An unsolicited 101 upgrades the body to a raw connection, outside the
	// normal HTTP body cancellation path. Close it without trying to read it.
	if response.StatusCode == http.StatusSwitchingProtocols {
		return result, nil
	}
	result.Body, err = io.ReadAll(io.LimitReader(response.Body, maxResponseBody+1))
	if len(result.Body) > maxResponseBody {
		result.Body = result.Body[:maxResponseBody]
		result.Truncated = true
	}
	if err != nil {
		return result, requestError{err}
	}
	return result, nil
}

// net/http errors normally include the complete destination URL. Keep them
// unwrap-able for classification without exposing URL credentials/query data,
// resolved IPs, or sensitive response content through ordinary error logging.
type requestError struct{ cause error }

func (err requestError) Error() string {
	switch {
	case errors.Is(err.cause, ErrUnsafeDestination):
		return ErrUnsafeDestination.Error()
	case errors.Is(err.cause, context.DeadlineExceeded):
		return "outbound request timed out"
	case errors.Is(err.cause, context.Canceled):
		return "outbound request canceled"
	default:
		return "outbound HTTPS request failed"
	}
}

func (err requestError) Unwrap() error { return err.cause }
