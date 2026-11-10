package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cascadehook/internal/accounts"
)

func TestNotificationUpdateRejectsConflictingReadAndArchiveStates(t *testing.T) {
	for _, body := range []string{`{}`, `{"read":true,"archived":false}`, `{"read":false,"archived":true}`} {
		t.Run(body, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			request.SetPathValue("organization_id", "01a19b78-2317-73df-8183-e637f528500f")
			request.SetPathValue("notification_id", "01a19b78-2317-73df-8183-e637f5285010")
			response := httptest.NewRecorder()
			api := &api{}
			api.notificationResource(response, request, accounts.User{})
			if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "invalid_notification_update") {
				t.Fatalf("conflicting states were accepted: %d, %s", response.Code, response.Body.String())
			}
		})
	}
}
