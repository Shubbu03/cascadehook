package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"time"

	"cascadehook/internal/auth"
	"cascadehook/internal/clerk"
	"cascadehook/internal/delivery"
	"cascadehook/internal/limits"
	"cascadehook/internal/signing"
	"cascadehook/internal/store"
	"cascadehook/internal/telemetry"
)

type api struct {
	db              *store.Store
	logger          *slog.Logger
	vault           *signing.Vault
	outbound        *delivery.Client
	sessions        *auth.ClerkVerifier
	requestLimits   *limits.Limiter
	identityWebhook *clerk.Webhook
	clerkIssuer     string
	clerkBackend    *clerk.Client
	invitationURL   string
}

type HandlerOptions struct {
	DB              *store.Store
	Logger          *slog.Logger
	Vault           *signing.Vault
	Outbound        *delivery.Client
	Sessions        *auth.ClerkVerifier
	RequestLimits   limits.Config
	Metrics         *telemetry.Metrics
	IdentityWebhook *clerk.Webhook
	ClerkIssuer     string
	ClerkBackend    *clerk.Client
	InvitationURL   string
}

// readinessTimeout bounds the database check behind /readyz.
const readinessTimeout = 2 * time.Second

func NewHandler(options HandlerOptions) (http.Handler, error) {
	requestLimits, err := limits.New(options.RequestLimits)
	if err != nil {
		return nil, err
	}
	api := &api{
		db: options.DB, logger: options.Logger, vault: options.Vault,
		outbound: options.Outbound, sessions: options.Sessions,
		requestLimits:   requestLimits,
		identityWebhook: options.IdentityWebhook, clerkIssuer: options.ClerkIssuer,
		clerkBackend:  options.ClerkBackend,
		invitationURL: options.InvitationURL,
	}
	mux := http.NewServeMux()
	routes := make([]string, 0)
	handle := func(pattern string, handler http.HandlerFunc) {
		routes = append(routes, pattern)
		mux.HandleFunc(pattern, handler)
	}
	handle("/healthz", func(w http.ResponseWriter, r *http.Request) {
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
	handle("/readyz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if !allowGetHead(w, r) {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), readinessTimeout)
		defer cancel()
		if err := api.db.Ready(ctx); err != nil {
			writeProblem(w, r, http.StatusServiceUnavailable, "not_ready")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet {
			_, _ = io.WriteString(w, "{\"status\":\"ok\"}\n")
		}
	})
	handle("/v1/endpoints", api.withProjectKey(api.endpointCollection))
	handle("/v1/endpoints/{endpoint_id}", api.withProjectKey(api.endpointResource))
	handle("/v1/endpoints/{endpoint_id}/signing-secret", api.withProjectKey(api.rotateEndpointSecret))
	handle("/v1/endpoints/{endpoint_id}/verify", api.withProjectKey(api.verifyEndpoint))
	handle("/v1/events", api.withProjectKey(api.eventCollection))
	handle("/v1/events/{event_id}", api.withProjectKey(api.eventResource))
	handle("/v1/deliveries", api.withProjectKey(api.deliveryCollection))
	handle("/v1/deliveries/{delivery_id}", api.withProjectKey(api.deliveryResource))
	handle("/v1/deliveries/{delivery_id}/attempts", api.withProjectKey(api.deliveryAttempts))
	handle("/v1/deliveries/{delivery_id}/replay", api.withProjectKey(api.replayDelivery))
	handle("/v1/api-keys", api.withProjectKey(api.apiKeyCollection))
	handle("/v1/api-keys/{api_key_id}", api.withProjectKey(api.apiKeyResource))
	handle("/v1/api-keys/{api_key_id}/rotate", api.withProjectKey(api.rotateAPIKey))
	handle("/v1/project-status", api.withProjectKey(api.projectStatus))
	handle("/v1/me", api.accountResource)
	handle("/v1/webhooks/clerk", api.clerkWebhook)
	handle("/v1/organizations", api.withSession(api.organizationCollection))
	handle("/v1/organizations/{organization_id}", api.withSession(api.organizationResource))
	handle("/v1/organizations/{organization_id}/usage", api.withSession(api.organizationUsage))
	handle("/v1/organizations/{organization_id}/notifications", api.withSession(api.notificationCollection))
	handle("/v1/organizations/{organization_id}/notifications/unread-count", api.withSession(api.notificationUnreadCount))
	handle("/v1/organizations/{organization_id}/notifications/read-all", api.withSession(api.notificationReadAll))
	handle("/v1/organizations/{organization_id}/notifications/{notification_id}", api.withSession(api.notificationResource))
	handle("/v1/organizations/{organization_id}/members", api.withSession(api.membershipCollection))
	handle("/v1/organizations/{organization_id}/invitations", api.withSession(api.invitationCollection))
	handle("/v1/organizations/{organization_id}/invitations/{invitation_id}", api.withSession(api.revokeInvitation))
	handle("/v1/invitations/accept", api.withSession(api.acceptInvitation))
	handle("/v1/organizations/{organization_id}/members/{user_id}", api.withSession(api.membershipResource))
	handle("/v1/organizations/{organization_id}/projects", api.withSession(api.projectCollection))
	handle("/v1/projects/{project_id}", api.withSession(api.projectResource))
	handle("/v1/projects/{project_id}/status", api.withSessionProject(api.projectStatus, false))
	handle("/v1/projects/{project_id}/usage", api.withSessionProject(api.projectUsage, true))
	handle("/v1/projects/{project_id}/endpoints", api.withSessionProject(api.endpointCollection, false))
	handle("/v1/projects/{project_id}/endpoints/{endpoint_id}",
		api.withSessionProject(api.endpointResource, false))
	handle("/v1/projects/{project_id}/endpoints/{endpoint_id}/signing-secret",
		api.withSessionProject(api.rotateEndpointSecret, false))
	handle("/v1/projects/{project_id}/endpoints/{endpoint_id}/verify",
		api.withSessionProject(api.verifyEndpoint, false))
	handle("/v1/projects/{project_id}/events", api.withSessionProject(api.eventCollection, false))
	handle("/v1/projects/{project_id}/events/{event_id}", api.withSessionProject(api.eventResource, false))
	handle("/v1/projects/{project_id}/deliveries", api.withSessionProject(api.deliveryCollection, false))
	handle("/v1/projects/{project_id}/deliveries/{delivery_id}",
		api.withSessionProject(api.deliveryResource, false))
	handle("/v1/projects/{project_id}/deliveries/{delivery_id}/attempts",
		api.withSessionProject(api.deliveryAttempts, false))
	handle("/v1/projects/{project_id}/deliveries/{delivery_id}/replay",
		api.withSessionProject(api.replayDelivery, false))
	handle("/v1/projects/{project_id}/api-keys", api.withSessionProject(api.apiKeyCollection, true))
	handle("/v1/projects/{project_id}/api-keys/{api_key_id}", api.withSessionProject(api.apiKeyResource, true))
	handle("/v1/projects/{project_id}/api-keys/{api_key_id}/rotate",
		api.withSessionProject(api.rotateAPIKey, true))
	handle("/", func(w http.ResponseWriter, r *http.Request) {
		writeProblem(w, r, http.StatusNotFound, "not_found")
	})
	handler := api.withCORS(api.withGlobalLimit(mux))
	if options.Metrics != nil {
		handler = options.Metrics.HTTP(handler, routes)
	}
	return handler, nil
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
