package httpapi

import (
	"context"
	"errors"
	"io"
	"net/http"
	"time"

	"cascadehook/internal/clerk"
)

func (api *api) clerkWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeProblem(
			w,
			r,
			http.StatusMethodNotAllowed,
			"method_not_allowed",
		)
		return
	}
	if api.identityWebhook == nil {
		writeProblem(
			w,
			r,
			http.StatusServiceUnavailable,
			"identity_webhooks_not_configured",
		)
		return
	}
	if !accountQueryEmpty(w, r) {
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 256<<10))
	if err != nil {
		writeProblem(
			w,
			r,
			http.StatusRequestEntityTooLarge,
			"payload_too_large",
		)
		return
	}
	event, err := api.identityWebhook.Verify(body, r.Header, time.Now())
	if err != nil {
		writeProblem(
			w,
			r,
			http.StatusBadRequest,
			"invalid_identity_webhook",
		)
		return
	}
	if event.Type == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	if err := api.db.ApplyIdentityEvent(ctx, api.clerkIssuer, event); err != nil {
		if errors.Is(err, clerk.ErrInvalidWebhook) {
			writeProblem(
				w,
				r,
				http.StatusBadRequest,
				"invalid_identity_webhook",
			)
			return
		}
		api.logger.Error("identity event could not be persisted", "error", err)
		writeProblem(
			w,
			r,
			http.StatusServiceUnavailable,
			"identity_webhook_unavailable",
		)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
