package httpapi

import (
	"io"
	"net/http"
	"time"
)

func (api *api) resendWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, r, "POST")
		return
	}
	if api.emailWebhook == nil {
		writeProblem(w, r, http.StatusServiceUnavailable, "email_webhooks_not_configured")
		return
	}
	if !accountQueryEmpty(w, r) {
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
	if err != nil {
		writeProblem(w, r, http.StatusRequestEntityTooLarge, "payload_too_large")
		return
	}
	event, err := api.emailWebhook.Verify(body, r.Header, time.Now())
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_email_webhook")
		return
	}
	if event.ID != "" {
		if err := api.db.ApplyEmailEvent(r.Context(), event); err != nil {
			api.logger.Error("email webhook could not be persisted", "error", err)
			writeProblem(w, r, http.StatusServiceUnavailable, "email_webhook_unavailable")
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}
