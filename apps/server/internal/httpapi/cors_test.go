package httpapi

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"testing"

	"cascadehook/internal/auth"
)

func TestLocalAccountCORS(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	publicKey := pem.EncodeToMemory(&pem.Block{
		Type: "RSA PUBLIC KEY", Bytes: x509.MarshalPKCS1PublicKey(&key.PublicKey),
	})
	verifier, err := auth.NewClerkVerifier(auth.ClerkConfig{
		IssuerURL:         "https://identity.example.com",
		JWTPublicKey:      string(publicKey),
		AuthorizedParties: []string{"http://localhost:3000"},
	})
	if err != nil {
		t.Fatal(err)
	}
	api := &api{sessions: verifier}
	handler := api.withCORS(http.HandlerFunc(api.accountResource))
	tests := []struct {
		name       string
		method     string
		origin     string
		headers    string
		wantStatus int
		wantOrigin string
	}{
		{
			name: "local preflight", method: http.MethodOptions,
			origin: "http://localhost:3000", headers: "authorization, content-type",
			wantStatus: http.StatusNoContent, wantOrigin: "http://localhost:3000",
		},
		{
			name: "different port", method: http.MethodOptions,
			origin: "http://localhost:3001", headers: "authorization",
			wantStatus: http.StatusForbidden,
		},
		{
			name: "unconfigured origin", method: http.MethodOptions,
			origin: "https://app.example.com", headers: "authorization",
			wantStatus: http.StatusForbidden,
		},
		{
			name: "unsupported header", method: http.MethodOptions,
			origin: "http://localhost:3000", headers: "authorization, x-unsafe-header",
			wantStatus: http.StatusForbidden, wantOrigin: "http://localhost:3000",
		},
		{
			name: "session still required", method: http.MethodGet,
			origin:     "http://localhost:3000",
			wantStatus: http.StatusUnauthorized, wantOrigin: "http://localhost:3000",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(test.method, "/v1/me", nil)
			request.Header.Set("Origin", test.origin)
			if test.method == http.MethodOptions {
				request.Header.Set("Access-Control-Request-Method", http.MethodGet)
				request.Header.Set("Access-Control-Request-Headers", test.headers)
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d: %s", response.Code, test.wantStatus, response.Body.String())
			}
			if origin := response.Header().Get("Access-Control-Allow-Origin"); origin != test.wantOrigin {
				t.Fatalf("allowed origin = %q, want %q", origin, test.wantOrigin)
			}
		})
	}
}
