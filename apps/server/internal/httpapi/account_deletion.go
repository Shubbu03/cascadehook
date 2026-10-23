package httpapi

import (
	"net/http"

	"cascadehook/internal/accounts"
)

func (api *api) deleteAccount(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if !emptyAccountAction(w, r) {
		return
	}
	deletion, err := api.db.RequestAccountDeletion(r.Context(), user.ID)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	api.logger.Info(
		"account deletion accepted",
		"user_id",
		user.ID,
		"deletion_requested_at",
		deletion.RequestedAt,
	)
	writeJSON(w, r, http.StatusAccepted, deletion)
}

func (api *api) deleteOrganization(w http.ResponseWriter, r *http.Request, user accounts.User) {
	id, ok := readResourceID(w, r, "organization_id")
	if !ok || !emptyAccountAction(w, r) {
		return
	}
	deletion, err := api.db.RequestOrganizationDeletion(r.Context(), user.ID, id)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	api.logger.Info(
		"organization deletion accepted",
		"organization_id",
		id,
		"actor_user_id",
		user.ID,
		"deletion_requested_at",
		deletion.RequestedAt,
	)
	writeJSON(w, r, http.StatusAccepted, deletion)
}
