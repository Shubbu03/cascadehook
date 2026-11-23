package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"cascadehook/internal/accounts"
	"cascadehook/internal/deliveries"
	"cascadehook/internal/pagination"
	"cascadehook/internal/store"
)

func (api *api) projectDetails(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if r.Method != http.MethodPatch {
		methodNotAllowed(w, r, "PATCH")
		return
	}
	id, ok := readResourceID(w, r, "project_id")
	if !ok || !accountQueryEmpty(w, r) {
		return
	}
	var body struct {
		Description optional[string] `json:"description"`
		Environment optional[string] `json:"environment"`
	}
	if err := readJSON(w, r, &body); err != nil {
		jsonProblem(w, r, err)
		return
	}
	details := accounts.ProjectDetails{Description: strings.TrimSpace(body.Description.Value), Environment: body.Environment.Value}
	if !body.Description.Set || !body.Environment.Set || !details.Valid() {
		writeProblem(w, r, http.StatusUnprocessableEntity, "invalid_project_details")
		return
	}
	if err := api.db.SaveProjectDetails(r.Context(), user.ID, id, details); err != nil {
		api.accountProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, details)
}

func (api *api) deliveryPolicy(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if !allowPreferencesMethod(w, r) || !accountQueryEmpty(w, r) {
		return
	}
	id, ok := readResourceID(w, r, "project_id")
	if !ok {
		return
	}
	if r.Method == http.MethodPatch {
		var policy deliveries.Policy
		if err := readJSON(w, r, &policy); err != nil {
			jsonProblem(w, r, err)
			return
		}
		if err := policy.Validate(); err != nil {
			writeProblem(w, r, http.StatusUnprocessableEntity, "invalid_delivery_policy")
			return
		}
		if err := api.db.SaveDeliveryPolicy(r.Context(), user.ID, id, policy); err != nil {
			api.accountProblem(w, r, err)
			return
		}
		writeJSON(w, r, http.StatusOK, policy)
		return
	}
	policy, err := api.db.DeliveryPolicy(r.Context(), user.ID, id)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, policy)
}

func (api *api) retentionPolicy(w http.ResponseWriter, r *http.Request, _ accounts.User) {
	if !allowGetHead(w, r) || !accountQueryEmpty(w, r) {
		return
	}
	policy, err := api.db.RetentionPolicy(r.Context())
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, policy)
}

type auditCursor struct {
	pagination.Cursor
	OrganizationID uuid.UUID  `json:"organization_id"`
	ProjectID      *uuid.UUID `json:"project_id"`
}

func (api *api) auditLog(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if !allowGetHead(w, r) {
		return
	}
	organizationID, ok := readResourceID(w, r, "organization_id")
	if !ok {
		return
	}
	query, limit, ok := readListQuery(w, r, "project_id")
	if !ok {
		return
	}
	projectID, ok := readUUIDFilter(w, r, query, "project_id")
	if !ok {
		return
	}
	options := pagination.Options{Limit: limit}
	if query.Has("cursor") {
		var cursor auditCursor
		if !decodeListCursor(w, r, query.Get("cursor"), &cursor) {
			return
		}
		matchesProject := cursor.ProjectID == nil && projectID == nil ||
			cursor.ProjectID != nil && projectID != nil && *cursor.ProjectID == *projectID
		if !cursor.Valid() || cursor.OrganizationID != organizationID || !matchesProject {
			writeProblem(w, r, http.StatusBadRequest, "invalid_cursor")
			return
		}
		options.Before = &cursor.Cursor
	}
	entries, err := api.db.ListAuditEntries(r.Context(), user.ID, organizationID, projectID, options)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	actorIDs := []uuid.UUID{}
	for _, entry := range entries[:min(len(entries), limit)] {
		if entry.ActorUserID != nil {
			actorIDs = append(actorIDs, *entry.ActorUserID)
		}
	}
	actors, err := api.db.AuditActors(r.Context(), organizationID, actorIDs)
	if err != nil && !errors.Is(err, accounts.ErrNotFound) {
		api.logger.Warn("audit actor profiles unavailable", "error", err)
	}
	api.memberProfiles(r, actors)
	for index := range entries {
		for _, actor := range actors {
			if entries[index].ActorUserID != nil && *entries[index].ActorUserID == actor.UserID {
				entries[index].ActorProfile = actor.Profile
			}
		}
	}
	writePage(w, r, entries, limit, func(entry store.AuditEntry) any {
		return auditCursor{Cursor: pagination.Cursor{CreatedAt: entry.CreatedAt, ID: entry.ID},
			OrganizationID: organizationID, ProjectID: projectID}
	})
}
