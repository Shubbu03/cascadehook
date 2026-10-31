package httpapi

import (
	"errors"
	"io"
	"net/http"
	"net/url"

	"github.com/google/uuid"

	"cascadehook/internal/accounts"
	"cascadehook/internal/notifications"
	"cascadehook/internal/pagination"
)

func (api *api) notificationCollection(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if !allowGetHead(w, r) {
		return
	}
	organizationID, ok := readResourceID(w, r, "organization_id")
	if !ok {
		return
	}
	query, limit, ok := readListQuery(w, r, "project_id", "category", "state")
	if !ok {
		return
	}
	filters, ok := notificationFilters(w, r, query)
	if !ok {
		return
	}
	options := notifications.ListOptions{Options: pagination.Options{Limit: limit}, Filters: filters}
	if query.Has("cursor") {
		var cursor notifications.Cursor
		if !decodeListCursor(w, r, query.Get("cursor"), &cursor) {
			return
		}
		if !cursor.Matches(organizationID, filters) {
			writeProblem(w, r, http.StatusBadRequest, "invalid_cursor")
			return
		}
		options.Before = &cursor.Cursor
	}
	items, err := api.db.ListNotifications(r.Context(), user.ID, organizationID, options)
	if err != nil {
		api.notificationProblem(w, r, err)
		return
	}
	writePage(w, r, items, limit, func(item notifications.Notification) any {
		return notifications.Cursor{
			Cursor:         pagination.Cursor{CreatedAt: item.CreatedAt, ID: item.ID},
			OrganizationID: organizationID, ProjectID: filters.ProjectID, Category: filters.Category, State: filters.State,
		}
	})
}

func (api *api) notificationUnreadCount(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if !allowGetHead(w, r) {
		return
	}
	organizationID, filters, ok := notificationActionFilters(w, r)
	if !ok {
		return
	}
	count, err := api.db.NotificationUnreadCount(r.Context(), user.ID, organizationID, filters)
	if err != nil {
		api.notificationProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, struct {
		UnreadCount int64 `json:"unread_count"`
	}{UnreadCount: count})
}

func (api *api) notificationResource(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if r.Method != http.MethodPatch {
		w.Header().Set("Allow", "PATCH")
		writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	organizationID, ok := readResourceID(w, r, "organization_id")
	if !ok {
		return
	}
	id, ok := readResourceID(w, r, "notification_id")
	if !ok || !accountQueryEmpty(w, r) {
		return
	}
	var body struct {
		Read     optional[bool] `json:"read"`
		Archived optional[bool] `json:"archived"`
	}
	if err := readJSON(w, r, &body); err != nil {
		jsonProblem(w, r, err)
		return
	}
	if !body.Read.Set && !body.Archived.Set {
		writeProblem(w, r, http.StatusBadRequest, "invalid_notification_update")
		return
	}
	var update notifications.Update
	if body.Read.Set {
		update.Read = &body.Read.Value
	}
	if body.Archived.Set {
		update.Archived = &body.Archived.Value
	}
	item, err := api.db.UpdateNotification(r.Context(), user.ID, organizationID, id, update)
	if err != nil {
		api.notificationProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, item)
}

func (api *api) notificationReadAll(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	organizationID, filters, ok := notificationActionFilters(w, r)
	if !ok {
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1))
	if err != nil || len(body) != 0 {
		writeProblem(w, r, http.StatusBadRequest, "unexpected_request_body")
		return
	}
	count, err := api.db.ReadAllNotifications(r.Context(), user.ID, organizationID, filters)
	if err != nil {
		api.notificationProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, struct {
		Updated int64 `json:"updated"`
	}{Updated: count})
}

func notificationActionFilters(w http.ResponseWriter, r *http.Request) (uuid.UUID, notifications.Filters, bool) {
	organizationID, ok := readResourceID(w, r, "organization_id")
	if !ok {
		return uuid.Nil, notifications.Filters{}, false
	}
	query, _, ok := readListQuery(w, r, "project_id", "category")
	if !ok {
		return uuid.Nil, notifications.Filters{}, false
	}
	if query.Has("limit") || query.Has("cursor") {
		writeProblem(w, r, http.StatusBadRequest, "invalid_filter")
		return uuid.Nil, notifications.Filters{}, false
	}
	filters, ok := notificationFilters(w, r, query)
	return organizationID, filters, ok
}

func notificationFilters(w http.ResponseWriter, r *http.Request, query url.Values) (notifications.Filters, bool) {
	// url.Values retains the same singular-key and strict UUID parsing as lists.
	projectID, ok := readUUIDFilter(w, r, query, "project_id")
	if !ok {
		return notifications.Filters{}, false
	}
	filters := notifications.Filters{ProjectID: projectID, State: notifications.All}
	if values, present := query["category"]; present {
		filters.Category = notifications.Category(values[0])
		if !filters.Category.Valid() {
			writeProblem(w, r, http.StatusBadRequest, "invalid_filter")
			return notifications.Filters{}, false
		}
	}
	if values, present := query["state"]; present {
		filters.State = notifications.State(values[0])
		if !filters.State.Valid() {
			writeProblem(w, r, http.StatusBadRequest, "invalid_filter")
			return notifications.Filters{}, false
		}
	}
	return filters, true
}

func (api *api) notificationProblem(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, notifications.ErrNotFound) {
		writeProblem(w, r, http.StatusNotFound, "notification_not_found")
		return
	}
	api.accountProblem(w, r, err)
}
