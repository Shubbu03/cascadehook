package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"time"

	"cascadehook/internal/delivery"
	"cascadehook/internal/signing"
	"cascadehook/internal/store"
)

type api struct {
	db       *store.Store
	logger   *slog.Logger
	vault    *signing.Vault
	outbound *delivery.Client
}

// readinessTimeout bounds the database check behind /readyz.
const readinessTimeout = 2 * time.Second

func NewHandler(db *store.Store, logger *slog.Logger, vault *signing.Vault, outbound *delivery.Client) http.Handler {
	api := &api{db: db, logger: logger, vault: vault, outbound: outbound}
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
		if err := db.Ping(ctx); err != nil {
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
	mux.HandleFunc("/v1/events", api.withProjectKey(api.publishEvent))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeProblem(w, r, http.StatusNotFound, "not_found")
	})
	return mux
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
