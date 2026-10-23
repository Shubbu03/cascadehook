// Package clerk implements the fixed-host Backend API operations used by cleanup.
package clerk

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	IssuerURL string
	SecretKey string `json:"-"`
}

func (cfg Config) Validate() error {
	if cfg.SecretKey == "" {
		return nil
	}
	u, err := url.Parse(cfg.IssuerURL)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" {
		return fmt.Errorf("CLERK_ISSUER_URL must be the exact instance HTTPS origin for provider cleanup")
	}
	invalidOrigin := u.User != nil || u.Path != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != ""
	if invalidOrigin || len(cfg.IssuerURL) > 255 || u.String() != cfg.IssuerURL {
		return fmt.Errorf("CLERK_ISSUER_URL must be the exact instance HTTPS origin for provider cleanup")
	}
	validPrefix := strings.HasPrefix(cfg.SecretKey, "sk_test_") || strings.HasPrefix(cfg.SecretKey, "sk_live_")
	if !validPrefix || len(cfg.SecretKey) < 32 || len(cfg.SecretKey) > 512 {
		return fmt.Errorf("CLERK_SECRET_KEY must be a Clerk instance secret key")
	}
	for _, char := range []byte(cfg.SecretKey) {
		if char < 33 || char > 126 {
			return fmt.Errorf("CLERK_SECRET_KEY must contain only non-space ASCII characters")
		}
	}
	return nil
}

type Client struct {
	issuer string
	secret string
	http   *http.Client
}

func New(cfg Config) (*Client, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if cfg.SecretKey == "" {
		return nil, nil
	}
	return &Client{
		issuer: cfg.IssuerURL,
		secret: cfg.SecretKey,
		http: &http.Client{
			Timeout:       5 * time.Second,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
			Transport: &http.Transport{
				DialContext:            (&net.Dialer{Timeout: 3 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
				TLSClientConfig:        &tls.Config{MinVersion: tls.VersionTLS12},
				TLSHandshakeTimeout:    3 * time.Second,
				ResponseHeaderTimeout:  4 * time.Second,
				IdleConnTimeout:        30 * time.Second,
				MaxConnsPerHost:        2,
				MaxIdleConns:           2,
				MaxResponseHeaderBytes: 16 << 10,
				DisableCompression:     true,
				ForceAttemptHTTP2:      true,
			},
		},
	}, nil
}

func (c *Client) Issuer() string { return c.issuer }

func (c *Client) CloseIdleConnections() { c.http.CloseIdleConnections() }

type DeleteError struct {
	Status     int
	Code       string
	RetryAfter time.Duration
}

func (err *DeleteError) Error() string {
	// Never return the request URL, credential, raw body, or provider message.
	return fmt.Sprintf("Clerk deletion failed: status=%d code=%s", err.Status, err.Code)
}

func (c *Client) DeleteUser(ctx context.Context, subject string) error {
	if !validUserID(subject) {
		return &DeleteError{Code: "invalid_identity"}
	}
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodDelete,
		"https://api.clerk.com/v1/users/"+subject,
		nil,
	)
	if err != nil {
		return &DeleteError{Code: "invalid_request"}
	}
	request.Header.Set("Authorization", "Bearer "+c.secret)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "cascadehook-janitor")
	response, err := c.http.Do(request)
	if err != nil {
		return &DeleteError{Code: "network_error"}
	}
	defer response.Body.Close()
	failure := &DeleteError{
		Status: response.StatusCode, Code: "http_error", RetryAfter: retryAfter(response.Header.Get("Retry-After")),
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, (64<<10)+1))
	if err != nil || len(body) > 64<<10 {
		failure.Code = "invalid_response"
		return failure
	}
	if response.StatusCode == http.StatusOK {
		var result struct {
			ID      string `json:"id"`
			Deleted bool   `json:"deleted"`
		}
		if json.Unmarshal(body, &result) == nil && result.ID == subject && result.Deleted {
			return nil
		}
		failure.Code = "invalid_response"
	}
	if response.StatusCode == http.StatusNotFound {
		var result struct {
			Errors []struct {
				Code string `json:"code"`
			} `json:"errors"`
		}
		if json.Unmarshal(body, &result) == nil && len(result.Errors) == 1 && result.Errors[0].Code == "resource_not_found" {
			// Resolve a lost acknowledgement or a user already removed in Clerk.
			return nil
		}
	}
	return failure
}

func validUserID(value string) bool {
	if !strings.HasPrefix(value, "user_") || len(value) <= 5 || len(value) > 255 {
		return false
	}
	for _, char := range value {
		letter := char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z'
		digit := char >= '0' && char <= '9'
		if !letter && !digit && char != '_' {
			return false
		}
	}
	return true
}

func retryAfter(value string) time.Duration {
	if seconds, err := strconv.ParseInt(value, 10, 64); err == nil && seconds > 0 {
		return time.Duration(min(seconds, 86400)) * time.Second
	}
	if at, err := http.ParseTime(value); err == nil {
		return min(max(time.Until(at), 0), 24*time.Hour)
	}
	return 0
}
