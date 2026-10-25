package clerk

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"cascadehook/internal/accounts"
)

type profileTransport func(*http.Request) (*http.Response, error)

func (transport profileTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func TestMemberProfilesScopesAndMinimizesIdentity(t *testing.T) {
	calls := 0
	client := &Client{secret: "test-secret", http: &http.Client{Transport: profileTransport(
		func(request *http.Request) (*http.Response, error) {
			calls++
			if request.Method != http.MethodGet || request.URL.Host != "api.clerk.com" || request.URL.Path != "/v1/users" {
				t.Fatal("profile lookup must use the fixed Clerk users endpoint")
			}
			query := request.URL.Query()
			if strings.Join(query["user_id"], ",") != "user_one,user_two" || query.Get("limit") != "2" {
				t.Fatal("lookup must be filtered and bounded to the requested identities")
			}
			if request.Header.Get("Authorization") != "Bearer test-secret" {
				t.Fatal("missing backend authorization")
			}
			body := `[
			 {"id":"user_one","first_name":"Ada","last_name":"Lovelace","primary_email_address_id":"email_primary",
			 "private_metadata":{"secret":"must-not-leak"},"email_addresses":[
			 {"id":"email_secondary","email_address":"private@example.com","verification":{"status":"verified"}},
			 {"id":"email_primary","email_address":"ADA@example.com","verification":{"status":"verified"}}]},
			 {"id":"user_two","username":"grace","primary_email_address_id":"email_unverified","email_addresses":[
			 {"id":"email_unverified","email_address":"unverified@example.com","verification":{"status":"unverified"}}]}
			]`
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(body)),
				Header:     make(http.Header),
			}, nil
		},
	)}}
	profiles, err := client.MemberProfiles(t.Context(), []string{"user_one", "user_two", "user_one"})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 1 || profiles["user_one"].Name != "Ada Lovelace" || profiles["user_one"].Email != "ada@example.com" {
		t.Fatal("expected one batched request and the primary verified identity")
	}
	if profiles["user_two"].Name != "grace" || profiles["user_two"].Email != "" {
		t.Fatal("username fallback must not expose unverified email addresses")
	}
	profile := profiles["user_one"]
	encoded, err := json.Marshal(accounts.Membership{
		IdentityIssuer:  "https://private-issuer.example",
		IdentitySubject: "user_one",
		Profile:         &profile,
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, private := range []string{"private-issuer", "user_one", "must-not-leak", "private@example.com"} {
		if strings.Contains(string(encoded), private) {
			t.Fatal("member response exposed private identity data")
		}
	}
}

func TestMemberProfilesRejectsInvalidRequestsAndResponses(t *testing.T) {
	for _, status := range []int{http.StatusTooManyRequests, http.StatusInternalServerError} {
		client := &Client{http: &http.Client{Transport: profileTransport(func(*http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader("provider-private-data"))}, nil
		})}}
		_, err := client.MemberProfiles(t.Context(), []string{"user_one"})
		if err == nil || strings.Contains(err.Error(), "provider-private-data") {
			t.Fatal("provider failure must be safe and explicit")
		}
	}
	client := &Client{http: &http.Client{Transport: profileTransport(func(*http.Request) (*http.Response, error) {
		t.Fatal("invalid or empty identity requests must not call Clerk")
		return nil, context.Canceled
	})}}
	if _, err := client.MemberProfiles(t.Context(), []string{"invalid/identity"}); err == nil {
		t.Fatal("expected invalid identity rejection")
	}
	if profiles, err := client.MemberProfiles(t.Context(), []string{}); err != nil || len(profiles) != 0 {
		t.Fatal("empty page must not require Clerk")
	}
	client.http.Transport = profileTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`[{"id":"user_outside","first_name":"Other"}]`)),
		}, nil
	})
	profiles, err := client.MemberProfiles(t.Context(), []string{"user_one"})
	if err != nil || len(profiles) != 0 {
		t.Fatal("unrequested identities must never be returned")
	}
	client.http.Transport = profileTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"data":[]}`))}, nil
	})
	if _, err := client.MemberProfiles(t.Context(), []string{"user_one"}); err == nil {
		t.Fatal("expected malformed list rejection")
	}
}
