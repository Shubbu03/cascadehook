package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"

	"github.com/google/uuid"

	"cascadehook/internal/auth"
	"cascadehook/internal/endpoints"
	"cascadehook/internal/events"
)

func (api *api) endpointCollection(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	switch r.Method {
	case http.MethodPost:
		var body struct {
			URL        string   `json:"url"`
			EventTypes []string `json:"event_types"`
		}
		if err := readJSON(w, r, &body); err != nil {
			jsonProblem(w, r, err)
			return
		}
		endpoint, err := api.db.CreateEndpoint(r.Context(), principal.ProjectID, endpoints.Registration{
			URL: body.URL, EventTypes: body.EventTypes,
		})
		if err != nil {
			api.endpointProblem(w, r, err)
			return
		}
		writeJSON(w, r, http.StatusCreated, endpoint)
	case http.MethodGet, http.MethodHead:
		api.listEndpoints(w, r, principal)
	default:
		w.Header().Set("Allow", "GET, HEAD, POST")
		writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
	}
}

func (api *api) endpointResource(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	if r.Method != http.MethodPatch && r.Method != http.MethodDelete {
		w.Header().Set("Allow", "PATCH, DELETE")
		writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	id, err := uuid.Parse(r.PathValue("endpoint_id"))
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_endpoint_id")
		return
	}
	if r.Method == http.MethodDelete {
		if err := api.db.DeleteEndpoint(r.Context(), principal.ProjectID, id); err != nil {
			api.endpointProblem(w, r, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	var body struct {
		URL        optional[string]   `json:"url"`
		Enabled    optional[bool]     `json:"enabled"`
		EventTypes optional[[]string] `json:"event_types"`
	}
	if err := readJSON(w, r, &body); err != nil {
		jsonProblem(w, r, err)
		return
	}
	if !body.URL.Set && !body.Enabled.Set && !body.EventTypes.Set {
		writeProblem(w, r, http.StatusBadRequest, "empty_update")
		return
	}
	var update endpoints.Update
	if body.URL.Set {
		update.URL = &body.URL.Value
	}
	if body.Enabled.Set {
		update.Enabled = &body.Enabled.Value
	}
	if body.EventTypes.Set {
		update.EventTypes = &body.EventTypes.Value
	}
	endpoint, err := api.db.UpdateEndpoint(r.Context(), principal.ProjectID, id, update)
	if err != nil {
		api.endpointProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, endpoint)
}

func (api *api) listEndpoints(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_pagination")
		return
	}
	for key, values := range query {
		if (key != "limit" && key != "cursor" && key != "enabled" && key != "event_type") || len(values) != 1 {
			writeProblem(w, r, http.StatusBadRequest, "invalid_pagination")
			return
		}
	}
	var enabled *bool
	if query.Has("enabled") {
		value := query.Get("enabled")
		if value != "true" && value != "false" {
			writeProblem(w, r, http.StatusBadRequest, "invalid_filter")
			return
		}
		flag := value == "true"
		enabled = &flag
	}
	eventType := query.Get("event_type")
	if query.Has("event_type") && !events.ValidType(eventType) {
		writeProblem(w, r, http.StatusBadRequest, "invalid_filter")
		return
	}
	limit := 20
	if query.Has("limit") {
		limit, err = strconv.Atoi(query.Get("limit"))
		if err != nil || limit < 1 || limit > 100 {
			writeProblem(w, r, http.StatusBadRequest, "invalid_pagination")
			return
		}
	}
	var before *endpoints.Cursor
	if query.Has("cursor") {
		value := query.Get("cursor")
		if len(value) == 0 || len(value) > 512 {
			writeProblem(w, r, http.StatusBadRequest, "invalid_cursor")
			return
		}
		data, err := base64.RawURLEncoding.DecodeString(value)
		if err != nil {
			writeProblem(w, r, http.StatusBadRequest, "invalid_cursor")
			return
		}
		var cursor endpoints.Cursor
		if err := json.Unmarshal(data, &cursor); err != nil || cursor.CreatedAt.IsZero() || cursor.ID == uuid.Nil {
			writeProblem(w, r, http.StatusBadRequest, "invalid_cursor")
			return
		}
		before = &cursor
	}
	result, err := api.db.ListEndpoints(r.Context(), principal.ProjectID, endpoints.ListOptions{
		Limit: limit, Before: before, Enabled: enabled, EventType: eventType,
	})
	if err != nil {
		api.endpointProblem(w, r, err)
		return
	}
	var nextCursor *string
	if len(result) > limit {
		last := result[limit-1]
		data, err := json.Marshal(endpoints.Cursor{CreatedAt: last.CreatedAt, ID: last.ID})
		if err != nil {
			api.endpointProblem(w, r, err)
			return
		}
		encoded := base64.RawURLEncoding.EncodeToString(data)
		nextCursor = &encoded
		result = result[:limit]
	}
	writeJSON(w, r, http.StatusOK, struct {
		Data       []endpoints.Endpoint `json:"data"`
		NextCursor *string              `json:"next_cursor"`
	}{Data: result, NextCursor: nextCursor})
}

func (api *api) endpointProblem(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, endpoints.ErrNotFound):
		writeProblem(w, r, http.StatusNotFound, "endpoint_not_found")
	case errors.Is(err, endpoints.ErrInvalidURL):
		writeProblem(w, r, http.StatusUnprocessableEntity, "invalid_endpoint_url")
	case errors.Is(err, endpoints.ErrInvalidEventTypes):
		writeProblem(w, r, http.StatusUnprocessableEntity, "invalid_event_types")
	case errors.Is(err, endpoints.ErrVerificationRequired):
		writeProblem(w, r, http.StatusConflict, "endpoint_not_verified")
	case errors.Is(err, endpoints.ErrSigningSecretRequired):
		writeProblem(w, r, http.StatusConflict, "signing_secret_required")
	case errors.Is(err, endpoints.ErrRotationInProgress):
		writeProblem(w, r, http.StatusConflict, "signing_secret_rotation_in_progress")
	case errors.Is(err, endpoints.ErrVerificationChanged):
		writeProblem(w, r, http.StatusConflict, "endpoint_verification_changed")
	case errors.Is(err, endpoints.ErrVerificationRateLimited):
		w.Header().Set("Retry-After", strconv.Itoa(int(endpoints.VerificationCooldown.Seconds())))
		writeProblem(w, r, http.StatusTooManyRequests, "endpoint_verification_rate_limited")
	case errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
		writeProblem(w, r, http.StatusServiceUnavailable, "request_timeout")
	default:
		api.logger.Error("endpoint operation failed", "error", err)
		writeProblem(w, r, http.StatusInternalServerError, "internal_error")
	}
}
