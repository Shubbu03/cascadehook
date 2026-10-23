package httpapi

import (
	"net/http"

	"github.com/google/uuid"

	"cascadehook/internal/accounts"
	"cascadehook/internal/auth"
)

func (api *api) organizationUsage(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if !allowGetHead(w, r) || !accountQueryEmpty(w, r) {
		return
	}
	id, ok := readResourceID(w, r, "organization_id")
	if !ok {
		return
	}
	org, err := api.db.GetOrganization(r.Context(), user.ID, id)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	if !org.Role.CanManageProjects() {
		api.accountProblem(w, r, accounts.ErrForbidden)
		return
	}
	usage, err := api.db.GetUsage(r.Context(), id, uuid.Nil)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	writeJSON(
		w,
		r,
		http.StatusOK,
		usage,
	)
}

func (api *api) projectUsage(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	if !allowGetHead(w, r) || !accountQueryEmpty(w, r) {
		return
	}
	project, err := api.db.GetProject(r.Context(), principal.UserID, principal.ProjectID)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	usage, err := api.db.GetUsage(r.Context(), project.OrganizationID, project.ID)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	writeJSON(
		w,
		r,
		http.StatusOK,
		usage,
	)
}
