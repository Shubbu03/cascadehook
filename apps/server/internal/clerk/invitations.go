package clerk

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// InvitationLink creates a ticket only for a new identity. Existing identities
// go through normal Clerk sign-in so MFA, SSO and device policies remain active.
func (c *Client) InvitationLink(ctx context.Context, email, destination string, expires time.Time) (string, string, error) {
	query := url.Values{"email_address": {email}, "limit": {"1"}}
	body, err := c.invitationRequest(ctx, http.MethodGet, "/users?"+query.Encode(), nil)
	if err != nil {
		return "", "", err
	}
	var users []struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(body, &users) != nil {
		return "", "", &DeleteError{Code: "invalid_user_lookup"}
	}
	if len(users) > 0 {
		return destination, "", nil
	}
	days := max(1, min(7, int(math.Ceil(time.Until(expires).Hours()/24))))
	input, err := json.Marshal(map[string]any{
		"email_address": email, "notify": false, "ignore_existing": true,
		"redirect_url": destination, "expires_in_days": days,
	})
	if err != nil {
		return "", "", err
	}
	body, err = c.invitationRequest(ctx, http.MethodPost, "/invitations", input)
	if err != nil {
		return "", "", err
	}
	var invitation struct {
		ID  string `json:"id"`
		URL string `json:"url"`
	}
	if json.Unmarshal(body, &invitation) != nil || invitation.ID == "" {
		return "", "", &DeleteError{Code: "invalid_invitation_response"}
	}
	u, err := url.Parse(invitation.URL)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || len(invitation.URL) > 8192 {
		return "", "", &DeleteError{Code: "invalid_invitation_url"}
	}
	return invitation.URL, invitation.ID, nil
}

func (c *Client) RevokeInvitation(ctx context.Context, id string) error {
	if !strings.HasPrefix(id, "inv_") || len(id) > 255 || strings.ContainsAny(id, "/?# \r\n") {
		return fmt.Errorf("invalid provider invitation ID")
	}
	_, err := c.invitationRequest(ctx, http.MethodPost, "/invitations/"+url.PathEscape(id)+"/revoke", nil)
	if failure, ok := err.(*DeleteError); ok && (failure.Status == 404 || failure.Status == 400) {
		return nil
	}
	return err
}

func (c *Client) invitationRequest(ctx context.Context, method, path string, body []byte) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, method, "https://api.clerk.com/v1"+path, bytes.NewReader(body))
	if err != nil {
		return nil, &DeleteError{Code: "invalid_invitation_request"}
	}
	request.Header.Set("Authorization", "Bearer "+c.secret)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	response, err := c.http.Do(request)
	if err != nil {
		return nil, &DeleteError{Code: "invitation_network_error"}
	}
	defer response.Body.Close()
	result, err := io.ReadAll(io.LimitReader(response.Body, (64<<10)+1))
	if err != nil || len(result) > 64<<10 {
		return nil, &DeleteError{Code: "invalid_invitation_response"}
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, &DeleteError{Status: response.StatusCode, Code: "invitation_request_failed", RetryAfter: retryAfter(response.Header.Get("Retry-After"))}
	}
	return result, nil
}
