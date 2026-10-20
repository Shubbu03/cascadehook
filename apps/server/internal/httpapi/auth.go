package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"cascadehook/internal/auth"
)

type projectHandler func(http.ResponseWriter, *http.Request, auth.Principal)

func (api *api) withProjectKey(next projectHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		values := r.Header.Values("Authorization")
		if len(values) != 1 {
			unauthorized(w, r)
			return
		}
		parts := strings.Fields(values[0])
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			unauthorized(w, r)
			return
		}
		digest, err := auth.DigestAPIKey(parts[1])
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
		next(w, r.WithContext(ctx), principal)
	}
}

func unauthorized(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("WWW-Authenticate", `Bearer realm="cascadehook"`)
	writeProblem(w, r, http.StatusUnauthorized, "invalid_api_key")
}
