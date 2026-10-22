package httpapi

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"

	"cascadehook/internal/auth"
	"cascadehook/internal/delivery"
	"cascadehook/internal/endpoints"
	"cascadehook/internal/signing"
)

func (api *api) rotateEndpointSecret(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	id, ok := endpointAction(w, r)
	if !ok {
		return
	}
	secret, err := signing.NewSecret()
	if err != nil {
		api.endpointProblem(w, r, err)
		return
	}
	encrypted := api.vault.Encrypt(principal.ProjectID, id, secret)
	result, err := api.db.RotateEndpointSecret(r.Context(), principal.ProjectID, id, encrypted)
	if err != nil {
		api.endpointProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, struct {
		EndpointID    uuid.UUID `json:"endpoint_id"`
		SigningSecret string    `json:"signing_secret"`
		endpoints.SecretRotation
	}{EndpointID: id, SigningSecret: secret.Token(), SecretRotation: result})
}

func (api *api) verifyEndpoint(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	id, ok := endpointAction(w, r)
	if !ok {
		return
	}
	snapshot, err := api.db.BeginEndpointVerification(r.Context(), principal.ProjectID, id)
	if err != nil {
		api.endpointProblem(w, r, err)
		return
	}
	secret, err := api.vault.Decrypt(principal.ProjectID, id, snapshot.SigningSecret)
	if err != nil {
		api.endpointProblem(w, r, err)
		return
	}
	var previous *signing.Secret
	if len(snapshot.PreviousSigningSecret) > 0 {
		decoded, err := api.vault.Decrypt(principal.ProjectID, id, snapshot.PreviousSigningSecret)
		if err != nil {
			api.endpointProblem(w, r, err)
			return
		}
		previous = &decoded
	}
	requestID, err := uuid.NewV7()
	if err != nil {
		api.endpointProblem(w, r, err)
		return
	}
	var nonce [32]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		api.endpointProblem(w, r, err)
		return
	}
	challenge := base64.RawURLEncoding.EncodeToString(nonce[:])
	var challengeBody struct {
		Type string `json:"type"`
		Data struct {
			EndpointID uuid.UUID `json:"endpoint_id"`
			Challenge  string    `json:"challenge"`
		} `json:"data"`
	}
	challengeBody.Type = "endpoint.verification"
	challengeBody.Data.EndpointID = id
	challengeBody.Data.Challenge = challenge
	body, err := json.Marshal(challengeBody)
	if err != nil {
		api.endpointProblem(w, r, err)
		return
	}
	response, err := api.outbound.PostJSON(r.Context(), snapshot.URL, body,
		secret.Headers(requestID, body, time.Now(), previous))
	if err != nil {
		if errors.Is(err, delivery.ErrUnsafeDestination) {
			writeProblem(w, r, http.StatusUnprocessableEntity, "unsafe_endpoint_destination")
		} else {
			// The client redacts URL/query/IP details from its error string.
			api.logger.Warn("endpoint verification request failed", "endpoint_id", id, "error", err)
			writeProblem(w, r, http.StatusBadGateway, "endpoint_verification_failed")
		}
		return
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || response.Truncated {
		writeProblem(w, r, http.StatusBadGateway, "endpoint_verification_failed")
		return
	}
	var reply struct {
		Proof string `json:"proof"`
	}
	decoder := json.NewDecoder(bytes.NewReader(response.Body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&reply); err != nil {
		writeProblem(w, r, http.StatusUnprocessableEntity, "invalid_verification_proof")
		return
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) || !secret.MatchesVerificationProof(requestID, challenge, reply.Proof) {
		writeProblem(w, r, http.StatusUnprocessableEntity, "invalid_verification_proof")
		return
	}
	endpoint, err := api.db.ConfirmEndpointVerification(r.Context(), principal.ProjectID, id, snapshot.Version)
	if err != nil {
		api.endpointProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, endpoint)
}

// Both action routes accept POST with an empty body. No caller-supplied secret,
// challenge, URL, or verification result is accepted from the management API.
func endpointAction(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
		return uuid.Nil, false
	}
	id, err := uuid.Parse(r.PathValue("endpoint_id"))
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_endpoint_id")
		return uuid.Nil, false
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1))
	if err != nil || len(body) != 0 {
		writeProblem(w, r, http.StatusBadRequest, "unexpected_request_body")
		return uuid.Nil, false
	}
	return id, true
}
