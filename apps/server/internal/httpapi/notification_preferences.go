package httpapi

import (
	"net/http"

	"cascadehook/internal/accounts"
	"cascadehook/internal/notifications"
)

func (api *api) notificationPreferences(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if !allowPreferencesMethod(w, r) || !accountQueryEmpty(w, r) {
		return
	}
	if r.Method == http.MethodPatch {
		var body struct {
			EmailSeverities optional[[]string]       `json:"email_severities"`
			EmailEnabled    optional[bool]           `json:"email_enabled"`
			EmailCategories []notifications.Category `json:"email_categories"`
		}
		if err := readJSON(w, r, &body); err != nil {
			jsonProblem(w, r, err)
			return
		}
		preferences := notifications.Preferences{
			EmailEnabled: body.EmailEnabled.Value, EmailCategories: body.EmailCategories,
			EmailSeverities: body.EmailSeverities.Value,
		}
		if !body.EmailEnabled.Set || !body.EmailSeverities.Set || !preferences.Valid() {
			writeProblem(w, r, http.StatusUnprocessableEntity, "invalid_notification_preferences")
			return
		}
		if err := api.db.SaveNotificationPreferences(r.Context(), user.ID, preferences); err != nil {
			api.accountProblem(w, r, err)
			return
		}
		writeJSON(w, r, http.StatusOK, preferences)
		return
	}
	preferences, err := api.db.NotificationPreferences(r.Context(), user.ID)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, struct {
		notifications.Preferences
		EmailAvailable bool `json:"email_available"`
	}{Preferences: preferences, EmailAvailable: api.emailEnabled && api.clerkBackend != nil})
}

func (api *api) projectNotificationPreferences(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if !allowPreferencesMethod(w, r) || !accountQueryEmpty(w, r) {
		return
	}
	projectID, ok := readResourceID(w, r, "project_id")
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
		if err := api.db.SaveProjectNotificationPreferences(r.Context(), user.ID, projectID, preferences); err != nil {
			api.accountProblem(w, r, err)
			return
		}
		writeJSON(w, r, http.StatusOK, preferences)
		return
	}
	preferences, err := api.db.ProjectNotificationPreferences(r.Context(), user.ID, projectID)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, preferences)
}

func allowPreferencesMethod(w http.ResponseWriter, r *http.Request) bool {
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodPatch:
		return true
	default:
		w.Header().Set("Allow", "GET, HEAD, PATCH")
		writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
		return false
	}
}
