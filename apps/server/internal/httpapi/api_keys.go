package httpapi

import (
	"context"
	"errors"
	"io"
	"net/http"
	"time"

	"cascadehook/internal/auth"
	"cascadehook/internal/pagination"
	"cascadehook/internal/store"
)

func (api *api) apiKeyCollection(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	switch r.Method {
	case http.MethodGet, http.MethodHead:
		api.listAPIKeys(w, r, principal)
	case http.MethodPost:
		api.createAPIKey(w, r, principal)
	default:
		w.Header().Set("Allow", "GET, HEAD, POST")
		writeProblem(
			w,
			r,
			http.StatusMethodNotAllowed,
			"method_not_allowed",
		)
	}
}

func (api *api) createAPIKey(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	if r.URL.RawQuery != "" {
		writeProblem(
			w,
			r,
			http.StatusBadRequest,
			"invalid_api_key_request",
		)
		return
	}
	var body struct {
		Name        string              `json:"name"`
		Environment auth.KeyEnvironment `json:"environment"`
		ExpiresAt   *time.Time          `json:"expires_at"`
	}
	if err := readJSON(w, r, &body); err != nil {
		jsonProblem(w, r, err)
		return
	}
	name, err := auth.NormalizeKeyName(body.Name)
	if err != nil {
		api.apiKeyProblem(w, r, err)
		return
	}
	credential, err := auth.NewAPIKey(body.Environment)
	if err != nil {
		api.apiKeyProblem(w, r, err)
		return
	}
	key, err := api.db.CreateAPIKey(r.Context(), principal, store.CreateAPIKeyParams{
		Name: name, Prefix: credential.Prefix, Hash: credential.Hash, ExpiresAt: body.ExpiresAt,
	})
	if err != nil {
		api.apiKeyProblem(w, r, err)
		return
	}
	api.logger.Info(
		"API key created",
		"project_id",
		principal.ProjectID,
		"api_key_id",
		key.ID,
		"actor_api_key_id",
		principal.APIKeyID,
	)
	w.Header().Set("Location", "/v1/api-keys/"+key.ID.String())
	// Deliberate one-time disclosure after commit. Credential values never
	// enter the store, metadata response types, or operational log fields.
	writeJSON(
		w,
		r,
		http.StatusCreated,
		struct {
			Key    auth.APIKey `json:"key"`
			APIKey string      `json:"api_key"`
		}{Key: key, APIKey: credential.Token},
	)
}

func (api *api) listAPIKeys(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	query, limit, ok := readListQuery(
		w,
		r,
		"environment",
		"status",
	)
	if !ok {
		return
	}
	environment := auth.KeyEnvironment(query.Get("environment"))
	status := auth.KeyStatus(query.Get("status"))
	if (query.Has("environment") && !auth.ValidKeyEnvironment(environment)) ||
		(query.Has("status") && !auth.ValidKeyStatus(status)) {
		writeProblem(
			w,
			r,
			http.StatusBadRequest,
			"invalid_filter",
		)
		return
	}
	before, ok := readPageCursor(w, r, query)
	if !ok {
		return
	}
	keys, err := api.db.ListAPIKeys(r.Context(), principal.ProjectID, auth.KeyListOptions{
		Limit: limit, Before: before, Environment: environment, Status: status,
	})
	if err != nil {
		api.apiKeyProblem(w, r, err)
		return
	}
	writePage(
		w,
		r,
		keys,
		limit,
		func(key auth.APIKey) any {
			return pagination.Cursor{CreatedAt: key.CreatedAt, ID: key.ID}
		},
	)
}

func (api *api) apiKeyResource(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodDelete {
		w.Header().Set("Allow", "GET, HEAD, DELETE")
		writeProblem(
			w,
			r,
			http.StatusMethodNotAllowed,
			"method_not_allowed",
		)
		return
	}
	id, ok := readResourceID(w, r, "api_key_id")
	if !ok {
		return
	}
	if r.Method == http.MethodDelete {
		if !emptyAPIKeyAction(w, r) {
			return
		}
		if err := api.db.RevokeAPIKey(r.Context(), principal, id); err != nil {
			api.apiKeyProblem(w, r, err)
			return
		}
		api.logger.Info(
			"API key revocation confirmed",
			"project_id",
			principal.ProjectID,
			"api_key_id",
			id,
			"actor_api_key_id",
			principal.APIKeyID,
		)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	key, err := api.db.GetAPIKey(r.Context(), principal.ProjectID, id)
	if err != nil {
		api.apiKeyProblem(w, r, err)
		return
	}
	writeJSON(
		w,
		r,
		http.StatusOK,
		key,
	)
}

func (api *api) rotateAPIKey(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
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
	id, ok := readResourceID(w, r, "api_key_id")
	if !ok || !emptyAPIKeyAction(w, r) {
		return
	}
	// Environment is immutable. Only metadata is read before generation; the
	// transaction rechecks the source/caller and all eligibility after locking.
	key, err := api.db.GetAPIKey(r.Context(), principal.ProjectID, id)
	if err != nil {
		api.apiKeyProblem(w, r, err)
		return
	}
	credential, err := auth.NewAPIKey(key.Environment)
	if err != nil {
		api.apiKeyProblem(w, r, err)
		return
	}
	rotation, err := api.db.RotateAPIKey(
		r.Context(),
		principal,
		id,
		credential.Prefix,
		credential.Hash,
	)
	if err != nil {
		api.apiKeyProblem(w, r, err)
		return
	}
	api.logger.Info(
		"API key rotated",
		"project_id",
		principal.ProjectID,
		"api_key_id",
		id,
		"replacement_api_key_id",
		rotation.Key.ID,
		"actor_api_key_id",
		principal.APIKeyID,
		"previous_key_revokes_at",
		rotation.RevokesAt,
	)
	w.Header().Set("Location", "/v1/api-keys/"+rotation.Key.ID.String())
	writeJSON(
		w,
		r,
		http.StatusCreated,
		struct {
			store.APIKeyRotation
			APIKey string `json:"api_key"`
		}{APIKeyRotation: rotation, APIKey: credential.Token},
	)
}

func emptyAPIKeyAction(w http.ResponseWriter, r *http.Request) bool {
	if r.URL.RawQuery != "" {
		writeProblem(
			w,
			r,
			http.StatusBadRequest,
			"invalid_api_key_request",
		)
		return false
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1))
	if err != nil || len(body) != 0 {
		writeProblem(
			w,
			r,
			http.StatusBadRequest,
			"unexpected_request_body",
		)
		return false
	}
	return true
}

func (api *api) apiKeyProblem(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, auth.ErrInvalidAPIKey):
		unauthorized(w, r)
	case errors.Is(err, auth.ErrAPIKeyNotFound):
		writeProblem(
			w,
			r,
			http.StatusNotFound,
			"api_key_not_found",
		)
	case errors.Is(err, auth.ErrInvalidKeyName):
		writeProblem(
			w,
			r,
			http.StatusUnprocessableEntity,
			"invalid_api_key_name",
		)
	case errors.Is(err, auth.ErrInvalidKeyEnvironment):
		writeProblem(
			w,
			r,
			http.StatusUnprocessableEntity,
			"invalid_api_key_environment",
		)
	case errors.Is(err, auth.ErrInvalidKeyExpiry):
		writeProblem(
			w,
			r,
			http.StatusUnprocessableEntity,
			"invalid_api_key_expiry",
		)
	case errors.Is(err, auth.ErrInactiveAPIKey):
		writeProblem(
			w,
			r,
			http.StatusConflict,
			"api_key_inactive",
		)
	case errors.Is(err, auth.ErrAPIKeyRotationPending):
		writeProblem(
			w,
			r,
			http.StatusConflict,
			"api_key_rotation_pending",
		)
	case errors.Is(err, auth.ErrLastUsableAPIKey):
		writeProblem(
			w,
			r,
			http.StatusConflict,
			"last_usable_api_key",
		)
	case errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
		writeProblem(
			w,
			r,
			http.StatusServiceUnavailable,
			"request_timeout",
		)
	default:
		api.logger.Error("API key management failed", "error", err)
		writeProblem(
			w,
			r,
			http.StatusInternalServerError,
			"internal_error",
		)
	}
}
