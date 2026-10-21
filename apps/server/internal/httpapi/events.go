package httpapi

import (
	"context"
	"errors"
	"io"
	"mime"
	"net/http"

	"cascadehook/internal/auth"
	"cascadehook/internal/events"
)

func (api *api) publishEvent(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	keys := r.Header.Values("Idempotency-Key")
	if len(keys) != 1 {
		writeProblem(w, r, http.StatusBadRequest, "invalid_idempotency_key")
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		jsonProblem(w, r, errUnsupportedMediaType)
		return
	}
	// Keep the full envelope, including whitespace and number representations.
	// These exact bytes are hashed, persisted, and eventually sent by workers.
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, events.MaxPayloadSize))
	if err != nil {
		jsonProblem(w, r, err)
		return
	}
	result, err := api.db.PublishEvent(r.Context(), principal.ProjectID, body, keys[0])
	if err != nil {
		api.publicationProblem(w, r, err)
		return
	}
	if result.Replayed {
		w.Header().Set("Idempotent-Replay", "true")
	}
	writeJSON(w, r, http.StatusAccepted, result)
}

func (api *api) publicationProblem(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, events.ErrInvalidIdempotencyKey):
		writeProblem(w, r, http.StatusBadRequest, "invalid_idempotency_key")
	case errors.Is(err, events.ErrInvalidEvent):
		writeProblem(w, r, http.StatusBadRequest, "invalid_event")
	case errors.Is(err, events.ErrInvalidType):
		writeProblem(w, r, http.StatusUnprocessableEntity, "invalid_event_type")
	case errors.Is(err, events.ErrPayloadTooLarge):
		writeProblem(w, r, http.StatusRequestEntityTooLarge, "request_too_large")
	case errors.Is(err, events.ErrIdempotencyConflict):
		writeProblem(w, r, http.StatusConflict, "idempotency_conflict")
	case errors.Is(err, auth.ErrInvalidAPIKey):
		unauthorized(w, r)
	case errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
		writeProblem(w, r, http.StatusServiceUnavailable, "request_timeout")
	default:
		api.logger.Error("event publication failed", "error", err)
		writeProblem(w, r, http.StatusInternalServerError, "internal_error")
	}
}
