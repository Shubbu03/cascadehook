package httpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"cascadehook/internal/auth"
)

type projectHandler func(http.ResponseWriter, *http.Request, auth.Principal)

// keyAccess maps a request method to the permission its API key needs.
// Unsupported methods need only status access so the handler can return 405.
type keyAccess func(method string) auth.Permission

func readOrManage(method string) auth.Permission {
	switch method {
	case http.MethodGet, http.MethodHead:
		return auth.PermitRead
	case http.MethodPost, http.MethodPatch, http.MethodPut, http.MethodDelete:
		return auth.PermitManage
	default:
		return auth.PermitStatus
	}
}

func readOrPublish(method string) auth.Permission {
	switch method {
	case http.MethodGet, http.MethodHead:
		return auth.PermitRead
	case http.MethodPost:
		return auth.PermitPublish
	default:
		return auth.PermitStatus
	}
}

func statusAccess(string) auth.Permission { return auth.PermitStatus }

// Key metadata and credential issuance are limited to full-access keys.
func manageAccess(string) auth.Permission { return auth.PermitManage }

func (api *api) withProjectKey(access keyAccess, next projectHandler) http.HandlerFunc {
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
		if !principal.Scope.Allows(access(r.Method)) {
			insufficientScope(w, r)
			return
		}
		next(w, r, principal)
	}
}

func insufficientScope(w http.ResponseWriter, r *http.Request) {
	writeProblem(w, r, http.StatusForbidden, "insufficient_scope")
}

func unauthorized(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("WWW-Authenticate", `Bearer realm="cascadehook"`)
	writeProblem(w, r, http.StatusUnauthorized, "invalid_api_key")
}
