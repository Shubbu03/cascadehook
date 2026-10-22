package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"time"

	"cascadehook/internal/auth"
	"cascadehook/internal/delivery"
	"cascadehook/internal/signing"
	"cascadehook/internal/store"
)

type api struct {
	db       *store.Store
	logger   *slog.Logger
	vault    *signing.Vault
	outbound *delivery.Client
	sessions *auth.ClerkVerifier
}

type HandlerOptions struct {
	DB       *store.Store
	Logger   *slog.Logger
	Vault    *signing.Vault
	Outbound *delivery.Client
	Sessions *auth.ClerkVerifier
}

// readinessTimeout bounds the database check behind /readyz.
const readinessTimeout = 2 * time.Second

func NewHandler(options HandlerOptions) http.Handler {
	api := &api{
		db: options.DB, logger: options.Logger, vault: options.Vault,
		outbound: options.Outbound, sessions: options.Sessions,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if !allowGetHead(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet {
			_, _ = io.WriteString(w, "{\"status\":\"ok\"}\n")
		}
	})
	// /readyz is the readiness probe: it fails while the database is
	// unreachable so load balancers stop routing traffic here, while
	// /healthz keeps reporting liveness.
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if !allowGetHead(w, r) {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), readinessTimeout)
		defer cancel()
		if err := api.db.Ping(ctx); err != nil {
			writeProblem(w, r, http.StatusServiceUnavailable, "not_ready")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet {
			_, _ = io.WriteString(w, "{\"status\":\"ok\"}\n")
		}
	})
	mux.HandleFunc("/v1/endpoints", api.withProjectKey(api.endpointCollection))
	mux.HandleFunc("/v1/endpoints/{endpoint_id}", api.withProjectKey(api.endpointResource))
	mux.HandleFunc("/v1/endpoints/{endpoint_id}/signing-secret", api.withProjectKey(api.rotateEndpointSecret))
	mux.HandleFunc("/v1/endpoints/{endpoint_id}/verify", api.withProjectKey(api.verifyEndpoint))
	mux.HandleFunc("/v1/events", api.withProjectKey(api.eventCollection))
	mux.HandleFunc("/v1/events/{event_id}", api.withProjectKey(api.eventResource))
	mux.HandleFunc("/v1/deliveries", api.withProjectKey(api.deliveryCollection))
	mux.HandleFunc("/v1/deliveries/{delivery_id}", api.withProjectKey(api.deliveryResource))
	mux.HandleFunc("/v1/deliveries/{delivery_id}/attempts", api.withProjectKey(api.deliveryAttempts))
	mux.HandleFunc("/v1/deliveries/{delivery_id}/replay", api.withProjectKey(api.replayDelivery))
	mux.HandleFunc("/v1/api-keys", api.withProjectKey(api.apiKeyCollection))
	mux.HandleFunc("/v1/api-keys/{api_key_id}", api.withProjectKey(api.apiKeyResource))
	mux.HandleFunc("/v1/api-keys/{api_key_id}/rotate", api.withProjectKey(api.rotateAPIKey))
	mux.HandleFunc("/v1/me", api.withSession(api.currentUser))
	mux.HandleFunc("/v1/organizations", api.withSession(api.organizationCollection))
	mux.HandleFunc("/v1/organizations/{organization_id}", api.withSession(api.organizationResource))
	mux.HandleFunc("/v1/organizations/{organization_id}/members", api.withSession(api.membershipCollection))
	mux.HandleFunc("/v1/organizations/{organization_id}/members/{user_id}", api.withSession(api.membershipResource))
	mux.HandleFunc("/v1/organizations/{organization_id}/projects", api.withSession(api.projectCollection))
	mux.HandleFunc("/v1/projects/{project_id}", api.withSession(api.projectResource))
	mux.HandleFunc("/v1/projects/{project_id}/endpoints", api.withSessionProject(api.endpointCollection, false))
	mux.HandleFunc("/v1/projects/{project_id}/endpoints/{endpoint_id}",
		api.withSessionProject(api.endpointResource, false))
	mux.HandleFunc("/v1/projects/{project_id}/endpoints/{endpoint_id}/signing-secret",
		api.withSessionProject(api.rotateEndpointSecret, false))
	mux.HandleFunc("/v1/projects/{project_id}/endpoints/{endpoint_id}/verify",
		api.withSessionProject(api.verifyEndpoint, false))
	mux.HandleFunc("/v1/projects/{project_id}/events", api.withSessionProject(api.eventCollection, false))
	mux.HandleFunc("/v1/projects/{project_id}/events/{event_id}", api.withSessionProject(api.eventResource, false))
	mux.HandleFunc("/v1/projects/{project_id}/deliveries", api.withSessionProject(api.deliveryCollection, false))
	mux.HandleFunc("/v1/projects/{project_id}/deliveries/{delivery_id}",
		api.withSessionProject(api.deliveryResource, false))
	mux.HandleFunc("/v1/projects/{project_id}/deliveries/{delivery_id}/attempts",
		api.withSessionProject(api.deliveryAttempts, false))
	mux.HandleFunc("/v1/projects/{project_id}/deliveries/{delivery_id}/replay",
		api.withSessionProject(api.replayDelivery, false))
	mux.HandleFunc("/v1/projects/{project_id}/api-keys", api.withSessionProject(api.apiKeyCollection, true))
	mux.HandleFunc("/v1/projects/{project_id}/api-keys/{api_key_id}", api.withSessionProject(api.apiKeyResource, true))
	mux.HandleFunc("/v1/projects/{project_id}/api-keys/{api_key_id}/rotate",
		api.withSessionProject(api.rotateAPIKey, true))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeProblem(w, r, http.StatusNotFound, "not_found")
	})
	return api.withCORS(mux)
}

// allowGetHead reports whether the request uses a supported method, writing a
// method_not_allowed problem when it does not.
func allowGetHead(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		return true
	}
	w.Header().Set("Allow", "GET, HEAD")
	writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
	return false
}

func writeProblem(w http.ResponseWriter, r *http.Request, status int, code string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	if r.Method == http.MethodHead {
		return
	}
	_ = json.NewEncoder(w).Encode(struct {
		Type   string `json:"type"`
		Title  string `json:"title"`
		Status int    `json:"status"`
		Code   string `json:"code"`
	}{
		Type:   "about:blank",
		Title:  http.StatusText(status),
		Status: status,
		Code:   code,
	})
}
