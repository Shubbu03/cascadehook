package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func sessionTestConfig(t *testing.T) (ClerkConfig, *rsa.PrivateKey) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	publicKey := pem.EncodeToMemory(&pem.Block{
		Type: "RSA PUBLIC KEY", Bytes: x509.MarshalPKCS1PublicKey(&key.PublicKey),
	})
	return ClerkConfig{
		IssuerURL:         "https://identity.example.com",
		JWTPublicKey:      string(publicKey),
		AuthorizedParties: []string{"http://localhost:3000"},
	}, key
}

func TestClerkVerifierApplicationOrigins(t *testing.T) {
	base, _ := sessionTestConfig(t)
	tests := []struct {
		origin string
		valid  bool
	}{
		{origin: "http://localhost:3000", valid: true},
		{origin: "http://127.0.0.1:3000", valid: true},
		{origin: "http://[::1]:3000", valid: true},
		{origin: "https://app.example.com", valid: true},
		{origin: "https://localhost:3000", valid: true},
		{origin: "http://app.example.com"},
		{origin: "http://192.168.1.10:3000"},
		{origin: "http://0.0.0.0:3000"},
		{origin: "http://localhost.example.com:3000"},
		{origin: "http://127.0.0.1.example.com:3000"},
		{origin: "http://localhost:3000/"},
		{origin: "http://localhost:3000/path"},
		{origin: "http://localhost:3000?"},
		{origin: "http://localhost:3000?query=1"},
		{origin: "http://localhost:3000#fragment"},
		{origin: "http://user@localhost:3000"},
		{origin: "ftp://localhost:3000"},
		{origin: "*"},
		{origin: "null"},
	}
	for _, test := range tests {
		t.Run(test.origin, func(t *testing.T) {
			cfg := base
			cfg.AuthorizedParties = []string{test.origin}
			_, err := NewClerkVerifier(cfg)
			if valid := err == nil; valid != test.valid {
				t.Fatalf("origin accepted = %t, want %t: %v", valid, test.valid, err)
			}
		})
	}
}

func TestClerkVerifierRequiresHTTPSIssuer(t *testing.T) {
	cfg, _ := sessionTestConfig(t)
	cfg.IssuerURL = "http://localhost:4000"
	if _, err := NewClerkVerifier(cfg); err == nil {
		t.Fatal("HTTP identity issuer must remain unsupported")
	}
}

func TestClerkVerifierLocalSessionOrigin(t *testing.T) {
	cfg, key := sessionTestConfig(t)
	verifier, err := NewClerkVerifier(cfg)
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		origin string
		valid  bool
	}{
		{origin: "http://localhost:3000", valid: true},
		{origin: "http://localhost:3001"},
		{origin: "http://127.0.0.1:3000"},
		{origin: "https://localhost:3000"},
		{origin: "https://app.example.com"},
	}
	for _, test := range tests {
		t.Run(test.origin, func(t *testing.T) {
			now := time.Now()
			token := jwt.NewWithClaims(jwt.SigningMethodRS256, clerkClaims{
				RegisteredClaims: jwt.RegisteredClaims{
					Issuer:    cfg.IssuerURL,
					Subject:   "user_test",
					IssuedAt:  jwt.NewNumericDate(now.Add(-time.Minute)),
					NotBefore: jwt.NewNumericDate(now.Add(-time.Minute)),
					ExpiresAt: jwt.NewNumericDate(now.Add(time.Minute)),
				},
				SessionID: "sess_test", AuthorizedParty: test.origin, Status: "active",
			})
			signed, err := token.SignedString(key)
			if err != nil {
				t.Fatal(err)
			}
			identity, err := verifier.Verify(signed)
			if valid := err == nil; valid != test.valid {
				t.Fatalf("session accepted = %t, want %t: %v", valid, test.valid, err)
			}
			if test.valid && identity.Subject != "user_test" {
				t.Fatal("verified session lost its user identity")
			}
			if verifier.AllowsOrigin(test.origin) != test.valid {
				t.Fatal("CORS and session origin allowlists differ")
			}
		})
	}
}
