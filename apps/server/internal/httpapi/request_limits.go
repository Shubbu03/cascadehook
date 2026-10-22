package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
)

func (api *api) withGlobalLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Probes must remain usable during application traffic saturation.
		if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		if wait := api.requestLimits.AllowGlobal(); wait > 0 {
			retryAfter := max(1, int((wait+time.Second-1)/time.Second))
			w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
			writeProblem(
				w,
				r,
				http.StatusTooManyRequests,
				"api_rate_limited",
			)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (api *api) admitProjectRequest(w http.ResponseWriter, r *http.Request, projectID uuid.UUID) bool {
	allowed, err := api.db.AdmitProjectRequest(r.Context(), projectID, api.requestLimits.ProjectBudget())
	if err != nil {
		api.logger.Error(
			"project request budget unavailable",
			"project_id",
			projectID,
			"error",
			err,
		)
		writeProblem(
			w,
			r,
			http.StatusServiceUnavailable,
			"request_controls_unavailable",
		)
		return false
	}
	if !allowed {
		// With a minimum refill rate of one token/second, this is an upper
		// bound on the next token's wait, not a reservation for the caller.
		w.Header().Set("Retry-After", "1")
		writeProblem(
			w,
			r,
			http.StatusTooManyRequests,
			"project_rate_limited",
		)
		return false
	}
	return true
}
