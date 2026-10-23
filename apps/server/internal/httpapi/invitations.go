package httpapi

import (
	"net/http"
	"net/url"

	"cascadehook/internal/accounts"
	"cascadehook/internal/pagination"
	"cascadehook/internal/store"
)

func (api *api) invitationCollection(w http.ResponseWriter, r *http.Request, user accounts.User) {
	organizationID, ok := readResourceID(w, r, "organization_id")
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet, http.MethodHead:
		options, ok := readAccountPage(w, r)
		if !ok {
			return
		}
		invitations, err := api.db.ListInvitations(
			r.Context(),
			user.ID,
			organizationID,
			options,
		)
		if err != nil {
			api.accountProblem(w, r, err)
			return
		}
		writePage(
			w,
			r,
			invitations,
			options.Limit,
			func(invitation accounts.Invitation) any {
				return pagination.Cursor{CreatedAt: invitation.CreatedAt, ID: invitation.ID}
			},
		)
	case http.MethodPost:
		if !accountQueryEmpty(w, r) {
			return
		}
		var body struct {
			Email string        `json:"email"`
			Role  accounts.Role `json:"role"`
		}
		if err := readJSON(w, r, &body); err != nil {
			jsonProblem(w, r, err)
			return
		}
		if body.Role == "" {
			body.Role = accounts.Member
		}
		token, hash, err := accounts.NewInvitationToken()
		if err != nil {
			api.accountProblem(w, r, err)
			return
		}
		invitation, err := api.db.CreateInvitation(r.Context(), user.ID, store.CreateInvitationParams{
			OrganizationID: organizationID, Email: body.Email, Role: body.Role, Hash: hash,
		})
		if err != nil {
			api.accountProblem(w, r, err)
			return
		}
		link := ""
		if api.invitationURL != "" {
			link = api.invitationURL + "#token=" + url.QueryEscape(token)
		}
		w.Header().Set("Location", "/v1/organizations/"+organizationID.String()+"/invitations")
		writeJSON(
			w,
			r,
			http.StatusCreated,
			struct {
				Invitation accounts.Invitation `json:"invitation"`
				Token      string              `json:"token"`
				AcceptURL  string              `json:"accept_url,omitempty"`
			}{Invitation: invitation, Token: token, AcceptURL: link},
		)
	default:
		w.Header().Set("Allow", "GET, HEAD, POST")
		writeProblem(
			w,
			r,
			http.StatusMethodNotAllowed,
			"method_not_allowed",
		)
	}
}

func (api *api) revokeInvitation(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if r.Method != http.MethodDelete {
		w.Header().Set("Allow", "DELETE")
		writeProblem(
			w,
			r,
			http.StatusMethodNotAllowed,
			"method_not_allowed",
		)
		return
	}
	organizationID, ok := readResourceID(w, r, "organization_id")
	if !ok || !emptyAccountAction(w, r) {
		return
	}
	id, ok := readResourceID(w, r, "invitation_id")
	if !ok {
		return
	}
	if err := api.db.RevokeInvitation(
		r.Context(),
		user.ID,
		organizationID,
		id,
	); err != nil {
		api.accountProblem(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (api *api) acceptInvitation(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeProblem(
			w,
			r,
			http.StatusMethodNotAllowed,
			"method_not_allowed",
		)
		return
	}
	if !accountQueryEmpty(w, r) {
		return
	}
	var body struct {
		Token string `json:"token"`
	}
	if err := readJSON(w, r, &body); err != nil {
		jsonProblem(w, r, err)
		return
	}
	hash, err := accounts.InvitationDigest(body.Token)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	if api.clerkBackend == nil {
		writeProblem(
			w,
			r,
			http.StatusServiceUnavailable,
			"invitation_identity_lookup_not_configured",
		)
		return
	}
	subject, err := api.db.InvitationIdentity(r.Context(), user.ID, hash)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	emails, err := api.clerkBackend.VerifiedEmails(r.Context(), subject)
	if err != nil {
		api.logger.Warn("invitation verified-email lookup failed", "error", err)
		writeProblem(
			w,
			r,
			http.StatusServiceUnavailable,
			"invitation_identity_lookup_unavailable",
		)
		return
	}
	member, err := api.db.AcceptInvitation(
		r.Context(),
		user.ID,
		hash,
		emails,
	)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	writeJSON(
		w,
		r,
		http.StatusOK,
		member,
	)
}
