package auth

import (
	"crypto/rsa"
	"errors"
	"fmt"
	"net/url"
	"slices"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

var ErrInvalidSession = errors.New("invalid session token")

type ClerkConfig struct {
	IssuerURL         string
	JWTPublicKey      string
	AuthorizedParties []string
}

// SessionIdentity contains only verified provider identity. Provider organization
// claims and email addresses never grant access to a CascadeHook organization.
type SessionIdentity struct {
	Issuer    string
	Subject   string
	SessionID string
}

type ClerkVerifier struct {
	issuer  string
	key     *rsa.PublicKey
	parties []string
	parser  *jwt.Parser
}

type clerkClaims struct {
	jwt.RegisteredClaims
	SessionID       string `json:"sid"`
	AuthorizedParty string `json:"azp"`
	Status          string `json:"sts"`
}

// NewClerkVerifier uses the instance's configured public key, so authentication
// never follows token-controlled URLs or depends on a per-request network call.
// An entirely empty configuration disables human routes until Clerk is set up.
func NewClerkVerifier(cfg ClerkConfig) (*ClerkVerifier, error) {
	if cfg.IssuerURL == "" && cfg.JWTPublicKey == "" && len(cfg.AuthorizedParties) == 0 {
		return nil, nil
	}
	if !validHTTPSOrigin(cfg.IssuerURL) {
		return nil, fmt.Errorf("CLERK_ISSUER_URL must be the exact HTTPS origin of your Clerk instance")
	}
	if len(cfg.AuthorizedParties) == 0 {
		return nil, fmt.Errorf("CLERK_AUTHORIZED_PARTIES must contain at least one HTTPS application origin")
	}
	for _, party := range cfg.AuthorizedParties {
		if !validHTTPSOrigin(party) {
			return nil, fmt.Errorf("CLERK_AUTHORIZED_PARTIES must contain only exact HTTPS application origins")
		}
	}
	key, err := jwt.ParseRSAPublicKeyFromPEM([]byte(cfg.JWTPublicKey))
	if err != nil || key.N.BitLen() < 2048 {
		return nil, fmt.Errorf("CLERK_JWT_PUBLIC_KEY must be a PEM-encoded RSA public key of at least 2048 bits")
	}
	return &ClerkVerifier{
		issuer:  cfg.IssuerURL,
		key:     key,
		parties: slices.Clone(cfg.AuthorizedParties),
		parser: jwt.NewParser(
			jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}),
			jwt.WithIssuer(cfg.IssuerURL),
			jwt.WithExpirationRequired(),
			jwt.WithNotBeforeRequired(),
			jwt.WithIssuedAt(),
			jwt.WithStrictDecoding(),
		),
	}, nil
}

func (verifier *ClerkVerifier) Verify(token string) (SessionIdentity, error) {
	if token == "" || len(token) > 16<<10 {
		return SessionIdentity{}, ErrInvalidSession
	}
	var claims clerkClaims
	_, err := verifier.parser.ParseWithClaims(token, &claims, func(_ *jwt.Token) (any, error) {
		return verifier.key, nil
	})
	if err != nil {
		return SessionIdentity{}, ErrInvalidSession
	}
	validSubject := validClerkID(claims.Subject, "user_")
	validSession := validClerkID(claims.SessionID, "sess_")
	validStatus := claims.Status == "" || claims.Status == "active"
	if !validSubject || !validSession || !validStatus {
		return SessionIdentity{}, ErrInvalidSession
	}
	if claims.IssuedAt == nil || !slices.Contains(verifier.parties, claims.AuthorizedParty) {
		return SessionIdentity{}, ErrInvalidSession
	}
	if !claims.ExpiresAt.After(claims.IssuedAt.Time) {
		return SessionIdentity{}, ErrInvalidSession
	}
	return SessionIdentity{Issuer: verifier.issuer, Subject: claims.Subject, SessionID: claims.SessionID}, nil
}

func (verifier *ClerkVerifier) AllowsOrigin(origin string) bool {
	return slices.Contains(verifier.parties, origin)
}

func validHTTPSOrigin(value string) bool {
	u, err := url.Parse(value)
	if err != nil || len(value) > 255 {
		return false
	}
	if u.Scheme != "https" || u.Hostname() == "" || u.ForceQuery {
		return false
	}
	return u.User == nil && u.Path == "" && u.RawQuery == "" && u.Fragment == "" && u.String() == value
}

func validClerkID(value, prefix string) bool {
	if !strings.HasPrefix(value, prefix) || len(value) <= len(prefix) || len(value) > 255 {
		return false
	}
	for _, character := range value {
		letter := character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z'
		digit := character >= '0' && character <= '9'
		if !letter && !digit && character != '_' {
			return false
		}
	}
	return true
}
