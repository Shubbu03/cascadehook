package httpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"cascadehook/internal/auth"
)

type projectHandler func(http.ResponseWriter, *http.Request, auth.Principal)

func (api *api) withProjectKey(next projectHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		token, ok := bearerToken(r)
		if !ok {
			unauthorized(w, r)
			return
		}
		digest, err := auth.DigestAPIKey(token)
		if err != nil {
			unauthorized(w, r)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		principal, err := api.db.FindAPIKey(ctx, digest)
		if errors.Is(err, auth.ErrInvalidAPIKey) {
			unauthorized(w, r)
			return
		}
		if err != nil {
			api.logger.Error("API key lookup failed", "error", err)
			writeProblem(w, r, http.StatusServiceUnavailable, "authentication_unavailable")
			return
		}
		r = r.WithContext(ctx)
		if !api.admitProjectRequest(w, r, principal.ProjectID) {
			return
		}
		next(w, r, principal)
	}
}

func unauthorized(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("WWW-Authenticate", `Bearer realm="cascadehook"`)
	writeProblem(w, r, http.StatusUnauthorized, "invalid_api_key")
}
