package httpapi

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"cascadehook/internal/auth"
	"cascadehook/internal/controls"
)

// Customers may inspect suspension state, but only the database-backed
// operator command can change it. A project credential cannot resume itself.
func (api *api) projectStatus(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	if !allowGetHead(w, r) {
		return
	}
	if r.URL.RawQuery != "" {
		writeProblem(
			w,
			r,
			http.StatusBadRequest,
			"invalid_project_status_request",
		)
		return
	}
	state, err := api.db.GetProjectState(r.Context(), principal.ProjectID)
	if err != nil {
		api.projectControlProblem(w, r, err)
		return
	}
	// API-key callers can confirm their key's scope before attempting writes.
	var scope *auth.KeyScope
	if principal.APIKeyID != uuid.Nil {
		scope = &principal.Scope
	}
	writeJSON(
		w,
		r,
		http.StatusOK,
		struct {
			controls.ProjectState
			APIKeyScope *auth.KeyScope `json:"api_key_scope,omitempty"`
		}{ProjectState: state, APIKeyScope: scope},
	)
}

func (api *api) projectControlProblem(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, controls.ErrSuspended):
		writeProblem(
			w,
			r,
			http.StatusForbidden,
			"project_suspended",
		)
	case errors.Is(err, controls.ErrProjectNotFound):
		writeProblem(
			w,
			r,
			http.StatusNotFound,
			"project_not_found",
		)
	case errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
		writeProblem(
			w,
			r,
			http.StatusServiceUnavailable,
			"request_timeout",
		)
	default:
		api.logger.Error("project status lookup failed", "error", err)
		writeProblem(
			w,
			r,
			http.StatusInternalServerError,
			"internal_error",
		)
	}
}
