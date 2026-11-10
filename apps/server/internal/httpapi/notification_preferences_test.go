package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cascadehook/internal/accounts"
)

func TestNotificationPreferencesRejectInvalidRequests(t *testing.T) {
	cases := []struct {
		name, body string
		status     int
	}{
		{name: "missing switch", body: `{"email_categories":[]}`, status: http.StatusUnprocessableEntity},
		{name: "missing categories", body: `{"email_enabled":false}`, status: http.StatusUnprocessableEntity},
		{name: "null switch", body: `{"email_enabled":null,"email_categories":[]}`, status: http.StatusBadRequest},
		{name: "null categories", body: `{"email_enabled":true,"email_categories":null}`, status: http.StatusUnprocessableEntity},
		{name: "unknown category", body: `{"email_enabled":true,"email_categories":["unknown"]}`, status: http.StatusUnprocessableEntity},
		{name: "duplicate category", body: `{"email_enabled":true,"email_categories":["team","team"]}`, status: http.StatusUnprocessableEntity},
		{name: "missing severities", body: `{"email_enabled":true,"email_categories":[]}`, status: http.StatusUnprocessableEntity},
		{name: "unknown field", body: `{"email_enabled":true,"email_categories":[],"user_id":"other-user"}`, status: http.StatusBadRequest},
		{name: "unknown severity", body: `{"email_enabled":true,"email_categories":[],"email_severities":["critical"]}`, status: http.StatusUnprocessableEntity},
		{name: "duplicate severity", body: `{"email_enabled":true,"email_categories":[],"email_severities":["error","error"]}`, status: http.StatusUnprocessableEntity},
		{name: "null severities", body: `{"email_enabled":true,"email_categories":[],"email_severities":null}`, status: http.StatusBadRequest},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPatch, "/v1/me/notification-preferences", strings.NewReader(item.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			// Invalid input must be rejected before any database operation.
			api := &api{}
			api.notificationPreferences(response, request, accounts.User{})
			if response.Code != item.status {
				t.Fatalf("status %d, want %d: %s", response.Code, item.status, response.Body.String())
			}
		})
	}
}
