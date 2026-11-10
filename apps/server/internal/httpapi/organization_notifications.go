package httpapi

import (
	"errors"
	"net/http"

	"cascadehook/internal/accounts"
	"cascadehook/internal/notifications"
	"cascadehook/internal/store"
)

func (api *api) organizationNotificationPreferences(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if !allowPreferencesMethod(w, r) || !accountQueryEmpty(w, r) {
		return
	}
	id, ok := readResourceID(w, r, "organization_id")
	if !ok {
		return
	}
	if r.Method == http.MethodPatch {
		var body struct {
			EmailEnabled optional[bool] `json:"email_enabled"`
		}
		if err := readJSON(w, r, &body); err != nil {
			jsonProblem(w, r, err)
			return
		}
		if !body.EmailEnabled.Set {
			writeProblem(w, r, http.StatusUnprocessableEntity, "invalid_notification_preferences")
			return
		}
		preferences := notifications.ProjectPreferences{EmailEnabled: body.EmailEnabled.Value}
		if err := api.db.SaveOrganizationNotificationPreferences(r.Context(), user.ID, id, preferences); err != nil {
			api.accountProblem(w, r, err)
			return
		}
		writeJSON(w, r, http.StatusOK, preferences)
		return
	}
	preferences, err := api.db.OrganizationNotificationPreferences(r.Context(), user.ID, id)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, preferences)
}

func (api *api) testNotificationEmail(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	id, ok := readResourceID(w, r, "organization_id")
	if !ok || !emptyAccountAction(w, r) {
		return
	}
	if !api.emailEnabled || api.clerkBackend == nil {
		writeProblem(w, r, http.StatusServiceUnavailable, "email_not_configured")
		return
	}
	job, err := api.db.QueueTestEmail(r.Context(), user.ID, id)
	if errors.Is(err, store.ErrEmailTestRateLimited) {
		w.Header().Set("Retry-After", "60")
		writeProblem(w, r, http.StatusTooManyRequests, "email_test_rate_limited")
		return
	}
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusAccepted, job)
}

func (api *api) testNotificationEmailStatus(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if !allowGetHead(w, r) || !accountQueryEmpty(w, r) {
		return
	}
	organizationID, ok := readResourceID(w, r, "organization_id")
	if !ok {
		return
	}
	id, ok := readResourceID(w, r, "email_id")
	if !ok {
		return
	}
	job, err := api.db.TestEmailStatus(r.Context(), user.ID, organizationID, id)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, job)
}
