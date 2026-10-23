package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"cascadehook/internal/accounts"
	"cascadehook/internal/auth"
)

type sessionHandler func(http.ResponseWriter, *http.Request, accounts.User)

func (api *api) withSession(next sessionHandler) http.HandlerFunc {
	return api.withAccountSession(next, false)
}

// Only DELETE /v1/me may re-enter a pending deletion to resolve a lost response.
func (api *api) withAccountSession(next sessionHandler, allowDeleting bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if api.sessions == nil {
			writeProblem(w, r, http.StatusServiceUnavailable, "sign_in_not_configured")
			return
		}
		token, ok := bearerToken(r)
		if !ok {
			invalidSession(w, r)
			return
		}
		identity, err := api.sessions.Verify(token)
		if err != nil {
			invalidSession(w, r)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		user, err := api.db.EnsureUser(ctx, identity)
		if errors.Is(err, accounts.ErrAccountDeleted) {
			api.accountProblem(w, r, err)
			return
		}
		if err != nil {
			api.logger.Error("account identity lookup failed", "error", err)
			writeProblem(w, r, http.StatusServiceUnavailable, "authentication_unavailable")
			return
		}
		if user.DeletionRequestedAt != nil && !allowDeleting {
			api.accountProblem(w, r, accounts.ErrAccountDeleted)
			return
		}
		next(w, r.WithContext(ctx), user)
	}
}

func (api *api) withSessionProject(next projectHandler, credentials bool) http.HandlerFunc {
	return api.withSession(func(w http.ResponseWriter, r *http.Request, user accounts.User) {
		id, ok := readResourceID(w, r, "project_id")
		if !ok {
			return
		}
		project, err := api.db.GetProject(r.Context(), user.ID, id)
		if err != nil {
			api.accountProblem(w, r, err)
			return
		}
		if !api.admitProjectRequest(w, r, project.ID) {
			return
		}
		readOnly := r.Method == http.MethodGet || r.Method == http.MethodHead
		if (credentials || !readOnly) && !project.Role.CanManageProjects() {
			api.accountProblem(w, r, accounts.ErrForbidden)
			return
		}
		next(w, r, auth.Principal{ProjectID: project.ID, UserID: user.ID})
	})
}

// Only explicit bearer tokens are accepted. Provider cookies, client-supplied
// user IDs, and project API keys cannot authenticate the human account routes.
func bearerToken(r *http.Request) (string, bool) {
	values := r.Header.Values("Authorization")
	if len(values) != 1 {
		return "", false
	}
	parts := strings.Fields(values[0])
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", false
	}
	return parts[1], true
}

func invalidSession(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("WWW-Authenticate", `Bearer realm="cascadehook"`)
	writeProblem(w, r, http.StatusUnauthorized, "invalid_session")
}

func projectResourceLocation(r *http.Request, resource string) string {
	if projectID := r.PathValue("project_id"); projectID != "" {
		return "/v1/projects/" + projectID + "/" + resource
	}
	return "/v1/" + resource
}
