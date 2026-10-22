package httpapi

import (
	"net/http"
	"slices"
	"strings"
)

func (api *api) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Vary", "Origin")
		origin := r.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(w, r)
			return
		}
		if api.sessions == nil || !api.sessions.AllowsOrigin(origin) {
			writeProblem(w, r, http.StatusForbidden, "origin_not_allowed")
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Expose-Headers", "Location, Idempotent-Replay, Retry-After")
		if r.Method != http.MethodOptions || r.Header.Get("Access-Control-Request-Method") == "" {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Add("Vary", "Access-Control-Request-Method")
		w.Header().Add("Vary", "Access-Control-Request-Headers")
		methods := []string{"GET", "HEAD", "POST", "PATCH", "DELETE"}
		if !slices.Contains(methods, r.Header.Get("Access-Control-Request-Method")) {
			writeProblem(w, r, http.StatusForbidden, "cors_method_not_allowed")
			return
		}
		allowedHeaders := []string{"authorization", "content-type", "idempotency-key"}
		for _, header := range strings.Split(r.Header.Get("Access-Control-Request-Headers"), ",") {
			header = strings.ToLower(strings.TrimSpace(header))
			if header != "" && !slices.Contains(allowedHeaders, header) {
				writeProblem(w, r, http.StatusForbidden, "cors_header_not_allowed")
				return
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", strings.Join(methods, ", "))
		w.Header().Set("Access-Control-Allow-Headers", strings.Join(allowedHeaders, ", "))
		w.Header().Set("Access-Control-Max-Age", "600")
		w.WriteHeader(http.StatusNoContent)
	})
}
