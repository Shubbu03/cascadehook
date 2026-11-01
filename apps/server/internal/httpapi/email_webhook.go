package httpapi

import (
	"io"
	"net/http"
	"time"
)

func (api *api) resendWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeProblem(w, r, 405, "method_not_allowed")
		return
	}
	if api.emailWebhook == nil {
		writeProblem(w, r, 503, "email_webhooks_not_configured")
		return
	}
	if !accountQueryEmpty(w, r) {
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
	if err != nil {
		writeProblem(w, r, 413, "payload_too_large")
		return
	}
	event, err := api.emailWebhook.Verify(body, r.Header, time.Now())
	if err != nil {
		writeProblem(w, r, 400, "invalid_email_webhook")
		return
	}
	if event.ID != "" {
		if err := api.db.ApplyEmailEvent(r.Context(), event); err != nil {
			api.logger.Error("email webhook could not be persisted", "error", err)
			writeProblem(w, r, 503, "email_webhook_unavailable")
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}
