package clerk

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"cascadehook/internal/accounts"
)

// MemberProfiles looks up only the explicit page of identities authorized by Go.
// Provider metadata, other email addresses and provider IDs never reach the UI.
func (c *Client) MemberProfiles(ctx context.Context, subjects []string) (map[string]accounts.MemberProfile, error) {
	profiles := make(map[string]accounts.MemberProfile, len(subjects))
	if len(subjects) == 0 {
		return profiles, nil
	}
	if len(subjects) > 100 {
		return nil, fmt.Errorf("too many member profiles")
	}
	wanted := make(map[string]bool, len(subjects))
	query := url.Values{}
	for _, subject := range subjects {
		if !validUserID(subject) {
			return nil, fmt.Errorf("invalid member identity")
		}
		if !wanted[subject] {
			wanted[subject] = true
			query.Add("user_id", subject)
		}
	}
	query.Set("limit", strconv.Itoa(len(wanted)))
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		"https://api.clerk.com/v1/users?"+query.Encode(),
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("invalid member profile request")
	}
	request.Header.Set("Authorization", "Bearer "+c.secret)
	request.Header.Set("Accept", "application/json")
	response, err := c.http.Do(request)
	if err != nil {
		return nil, fmt.Errorf("member profile lookup unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("member profile lookup returned HTTP %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, (2<<20)+1))
	if err != nil || len(body) > 2<<20 {
		return nil, fmt.Errorf("member profile response unavailable")
	}
	var users []struct {
		ID             string `json:"id"`
		FirstName      string `json:"first_name"`
		LastName       string `json:"last_name"`
		Username       string `json:"username"`
		PrimaryEmailID string `json:"primary_email_address_id"`
		Emails         []struct {
			ID           string `json:"id"`
			Address      string `json:"email_address"`
			Verification struct {
				Status string `json:"status"`
			} `json:"verification"`
		} `json:"email_addresses"`
	}
	if json.Unmarshal(body, &users) != nil || len(users) > len(wanted) {
		return nil, fmt.Errorf("invalid member profile response")
	}
	for _, user := range users {
		if !wanted[user.ID] {
			continue
		}
		profile := accounts.MemberProfile{Name: strings.TrimSpace(user.FirstName + " " + user.LastName)}
		if profile.Name == "" {
			profile.Name = strings.TrimSpace(user.Username)
		}
		for _, email := range user.Emails {
			if email.ID == user.PrimaryEmailID && email.Verification.Status == "verified" {
				if value, err := accounts.NormalizeEmail(email.Address); err == nil {
					profile.Email = value
				}
				break
			}
		}
		profiles[user.ID] = profile
	}
	return profiles, nil
}
