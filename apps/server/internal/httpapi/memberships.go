package httpapi

import (
	"net/http"

	"cascadehook/internal/accounts"
	"cascadehook/internal/pagination"
	"cascadehook/internal/store"
)

func (api *api) membershipCollection(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodPost {
		w.Header().Set("Allow", "GET, HEAD, POST")
		writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	organizationID, ok := readResourceID(w, r, "organization_id")
	if !ok {
		return
	}
	if r.Method == http.MethodPost {
		if !accountQueryEmpty(w, r) {
			return
		}
		var body struct {
			UserID string        `json:"user_id"`
			Role   accounts.Role `json:"role"`
		}
		if err := readJSON(w, r, &body); err != nil {
			jsonProblem(w, r, err)
			return
		}
		userID, ok := readMembershipUser(w, r, body.UserID)
		if !ok {
			return
		}
		member, err := api.db.AddMembership(r.Context(), user.ID, store.MembershipParams{
			OrganizationID: organizationID, UserID: userID, Role: body.Role,
		})
		if err != nil {
			api.accountProblem(w, r, err)
			return
		}
		api.logger.Info("organization member added", "organization_id", organizationID,
			"actor_user_id", user.ID, "user_id", userID, "role", member.Role)
		writeJSON(w, r, http.StatusCreated, member)
		return
	}
	options, ok := readAccountPage(w, r)
	if !ok {
		return
	}
	members, err := api.db.ListMemberships(r.Context(), user.ID, organizationID, options)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	api.memberProfiles(r, members[:min(len(members), options.Limit)])
	writePage(w, r, members, options.Limit, func(member accounts.Membership) any {
		return pagination.Cursor{CreatedAt: member.CreatedAt, ID: member.UserID}
	})
}

func (api *api) memberProfiles(r *http.Request, members []accounts.Membership) {
	if api.clerkBackend == nil {
		return
	}
	subjects := make([]string, 0, len(members))
	for _, member := range members {
		if member.IdentityIssuer == api.clerkBackend.Issuer() {
			subjects = append(subjects, member.IdentitySubject)
		}
	}
	profiles, err := api.clerkBackend.MemberProfiles(r.Context(), subjects)
	if err != nil {
		api.logger.Warn("member profiles unavailable", "error", err)
		return
	}
	for index := range members {
		if members[index].IdentityIssuer != api.clerkBackend.Issuer() {
			continue
		}
		if profile, ok := profiles[members[index].IdentitySubject]; ok {
			members[index].Profile = &profile
		}
	}
}

func (api *api) membershipResource(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if r.Method != http.MethodPatch && r.Method != http.MethodDelete {
		w.Header().Set("Allow", "PATCH, DELETE")
		writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	organizationID, ok := readResourceID(w, r, "organization_id")
	if !ok || !accountQueryEmpty(w, r) {
		return
	}
	userID, ok := readResourceID(w, r, "user_id")
	if !ok {
		return
	}
	if r.Method == http.MethodDelete {
		if !emptyAccountAction(w, r) {
			return
		}
		if err := api.db.RemoveMembership(r.Context(), user.ID, organizationID, userID); err != nil {
			api.accountProblem(w, r, err)
			return
		}
		api.logger.Info("organization member removed", "organization_id", organizationID,
			"actor_user_id", user.ID, "user_id", userID)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	var body struct {
		Role accounts.Role `json:"role"`
	}
	if err := readJSON(w, r, &body); err != nil {
		jsonProblem(w, r, err)
		return
	}
	member, err := api.db.ChangeMembershipRole(r.Context(), user.ID, store.MembershipParams{
		OrganizationID: organizationID, UserID: userID, Role: body.Role,
	})
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	api.logger.Info("organization member role changed", "organization_id", organizationID,
		"actor_user_id", user.ID, "user_id", userID, "role", member.Role)
	writeJSON(w, r, http.StatusOK, member)
}
