package clerk

import (
	"context"
	"encoding/json"
	"io"
	"net/http"

	"cascadehook/internal/accounts"
)

func (c *Client) VerifiedEmails(ctx context.Context, subject string) ([]string, error) {
	if !validUserID(subject) {
		return nil, &DeleteError{Code: "invalid_identity"}
	}
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		"https://api.clerk.com/v1/users/"+subject,
		nil,
	)
	if err != nil {
		return nil, &DeleteError{Code: "invalid_request"}
	}
	request.Header.Set("Authorization", "Bearer "+c.secret)
	request.Header.Set("Accept", "application/json")
	response, err := c.http.Do(request)
	if err != nil {
		return nil, &DeleteError{Code: "network_error"}
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, &DeleteError{Status: response.StatusCode, Code: "user_lookup_failed"}
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if err != nil || len(body) > 1<<20 {
		return nil, &DeleteError{Code: "invalid_response"}
	}
	var user struct {
		ID     string `json:"id"`
		Emails []struct {
			Address      string `json:"email_address"`
			Verification struct {
				Status string `json:"status"`
			} `json:"verification"`
		} `json:"email_addresses"`
	}
	if json.Unmarshal(body, &user) != nil || user.ID != subject || len(user.Emails) > 100 {
		return nil, &DeleteError{Code: "invalid_response"}
	}
	emails := make([]string, 0, len(user.Emails))
	for _, email := range user.Emails {
		address, err := accounts.NormalizeEmail(email.Address)
		if err == nil && email.Verification.Status == "verified" {
			emails = append(emails, address)
		}
	}
	return emails, nil
}
