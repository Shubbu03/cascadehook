package httpapi

import (
	"context"
	"errors"
	"io"
	"net/http"

	"github.com/google/uuid"

	"cascadehook/internal/accounts"
	"cascadehook/internal/pagination"
	"cascadehook/internal/store"
)

func (api *api) accountResource(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodDelete {
		api.withAccountSession(api.deleteAccount, true)(w, r)
		return
	}
	api.withSession(api.currentUser)(w, r)
}

func (api *api) currentUser(w http.ResponseWriter, r *http.Request, user accounts.User) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD, DELETE")
		writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	if !accountQueryEmpty(w, r) {
		return
	}
	writeJSON(w, r, http.StatusOK, user)
}

func (api *api) organizationCollection(w http.ResponseWriter, r *http.Request, user accounts.User) {
	switch r.Method {
	case http.MethodGet, http.MethodHead:
		options, ok := readAccountPage(w, r)
		if !ok {
			return
		}
		organizations, err := api.db.ListOrganizations(r.Context(), user.ID, options)
		if err != nil {
			api.accountProblem(w, r, err)
			return
		}
		writePage(w, r, organizations, options.Limit, func(organization accounts.Organization) any {
			return pagination.Cursor{CreatedAt: organization.CreatedAt, ID: organization.ID}
		})
	case http.MethodPost:
		name, ok := readAccountName(w, r)
		if !ok {
			return
		}
		organization, err := api.db.CreateOrganization(r.Context(), user.ID, name)
		if err != nil {
			api.accountProblem(w, r, err)
			return
		}
		w.Header().Set("Location", "/v1/organizations/"+organization.ID.String())
		api.logger.Info("organization created", "organization_id", organization.ID, "actor_user_id", user.ID)
		writeJSON(w, r, http.StatusCreated, organization)
	default:
		w.Header().Set("Allow", "GET, HEAD, POST")
		writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
	}
}

func (api *api) organizationResource(w http.ResponseWriter, r *http.Request, user accounts.User) {
	switch r.Method {
	case http.MethodDelete:
		api.deleteOrganization(w, r, user)
		return
	case http.MethodGet, http.MethodHead, http.MethodPatch:
	default:
		w.Header().Set("Allow", "GET, HEAD, PATCH, DELETE")
		writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	id, ok := readResourceID(w, r, "organization_id")
	if !ok || !accountQueryEmpty(w, r) {
		return
	}
	if r.Method == http.MethodPatch {
		name, ok := readAccountName(w, r)
		if !ok {
			return
		}
		organization, err := api.db.RenameOrganization(r.Context(), user.ID, id, name)
		if err != nil {
			api.accountProblem(w, r, err)
			return
		}
		api.logger.Info("organization renamed", "organization_id", id, "actor_user_id", user.ID)
		writeJSON(w, r, http.StatusOK, organization)
		return
	}
	organization, err := api.db.GetOrganization(r.Context(), user.ID, id)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, organization)
}

func (api *api) projectCollection(w http.ResponseWriter, r *http.Request, user accounts.User) {
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
		name, ok := readAccountName(w, r)
		if !ok {
			return
		}
		project, err := api.db.CreateProject(r.Context(), user.ID, store.CreateProjectParams{
			OrganizationID: organizationID, Name: name,
		})
		if err != nil {
			api.accountProblem(w, r, err)
			return
		}
		w.Header().Set("Location", "/v1/projects/"+project.ID.String())
		api.logger.Info("project created", "project_id", project.ID,
			"organization_id", organizationID, "actor_user_id", user.ID)
		writeJSON(w, r, http.StatusCreated, project)
		return
	}
	options, ok := readAccountPage(w, r)
	if !ok {
		return
	}
	projects, err := api.db.ListProjects(r.Context(), user.ID, organizationID, options)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	writePage(w, r, projects, options.Limit, func(project accounts.Project) any {
		return pagination.Cursor{CreatedAt: project.CreatedAt, ID: project.ID}
	})
}

func (api *api) projectResource(w http.ResponseWriter, r *http.Request, user accounts.User) {
	switch r.Method {
	case http.MethodDelete:
		api.deleteProject(w, r, user)
		return
	case http.MethodGet, http.MethodHead, http.MethodPatch:
	default:
		w.Header().Set("Allow", "GET, HEAD, PATCH, DELETE")
		writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	id, ok := readResourceID(w, r, "project_id")
	if !ok || !accountQueryEmpty(w, r) {
		return
	}
	if r.Method == http.MethodPatch {
		name, ok := readAccountName(w, r)
		if !ok {
			return
		}
		project, err := api.db.RenameProject(r.Context(), user.ID, id, name)
		if err != nil {
			api.accountProblem(w, r, err)
			return
		}
		api.logger.Info("project renamed", "project_id", id, "actor_user_id", user.ID)
		writeJSON(w, r, http.StatusOK, project)
		return
	}
	project, err := api.db.GetProject(r.Context(), user.ID, id)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, project)
}

func (api *api) deleteProject(w http.ResponseWriter, r *http.Request, user accounts.User) {
	id, ok := readResourceID(w, r, "project_id")
	if !ok || !emptyAccountAction(w, r) {
		return
	}
	deletion, err := api.db.RequestProjectDeletion(r.Context(), user.ID, id)
	if err != nil {
		api.accountProblem(w, r, err)
		return
	}
	api.logger.Info(
		"project deletion accepted",
		"project_id",
		id,
		"actor_user_id",
		user.ID,
		"deletion_requested_at",
		deletion.RequestedAt,
	)
	writeJSON(w, r, http.StatusAccepted, deletion)
}

func accountQueryEmpty(w http.ResponseWriter, r *http.Request) bool {
	if r.URL.RawQuery != "" {
		writeProblem(w, r, http.StatusBadRequest, "invalid_account_request")
		return false
	}
	return true
}

func readAccountName(w http.ResponseWriter, r *http.Request) (string, bool) {
	if !accountQueryEmpty(w, r) {
		return "", false
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := readJSON(w, r, &body); err != nil {
		jsonProblem(w, r, err)
		return "", false
	}
	return body.Name, true
}

func readAccountPage(w http.ResponseWriter, r *http.Request) (pagination.Options, bool) {
	query, limit, ok := readListQuery(w, r)
	if !ok {
		return pagination.Options{}, false
	}
	before, ok := readPageCursor(w, r, query)
	return pagination.Options{Limit: limit, Before: before}, ok
}

func emptyAccountAction(w http.ResponseWriter, r *http.Request) bool {
	if !accountQueryEmpty(w, r) {
		return false
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1))
	if err != nil || len(body) != 0 {
		writeProblem(w, r, http.StatusBadRequest, "unexpected_request_body")
		return false
	}
	return true
}

func (api *api) accountProblem(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, accounts.ErrInvitationRateLimited):
		w.Header().Set("Retry-After", "5")
		writeProblem(
			w,
			r,
			http.StatusTooManyRequests,
			"invitation_lookup_rate_limited",
		)
	case errors.Is(err, accounts.ErrInvalidEmail):
		writeProblem(
			w,
			r,
			http.StatusUnprocessableEntity,
			"invalid_invitation_email",
		)
	case errors.Is(err, accounts.ErrInvitationConflict):
		writeProblem(
			w,
			r,
			http.StatusConflict,
			"invitation_pending",
		)
	case errors.Is(err, accounts.ErrInvitationInvalid):
		writeProblem(
			w,
			r,
			http.StatusConflict,
			"invitation_unavailable",
		)
	case errors.Is(err, accounts.ErrInvitationEmail):
		writeProblem(
			w,
			r,
			http.StatusForbidden,
			"invitation_email_mismatch",
		)
	case errors.Is(err, accounts.ErrQuotaExceeded):
		writeProblem(
			w,
			r,
			http.StatusConflict,
			"quota_exceeded",
		)
	case errors.Is(err, accounts.ErrAccountDeleted):
		writeProblem(w, r, http.StatusGone, "account_deleted")
	case errors.Is(err, accounts.ErrOwnsOrganizations):
		writeProblem(w, r, http.StatusConflict, "account_owns_organizations")
	case errors.Is(err, accounts.ErrNotFound):
		writeProblem(w, r, http.StatusNotFound, "account_resource_not_found")
	case errors.Is(err, accounts.ErrForbidden):
		writeProblem(w, r, http.StatusForbidden, "insufficient_permissions")
	case errors.Is(err, accounts.ErrInvalidName):
		writeProblem(w, r, http.StatusUnprocessableEntity, "invalid_name")
	case errors.Is(err, accounts.ErrInvalidRole):
		writeProblem(w, r, http.StatusUnprocessableEntity, "invalid_role")
	case errors.Is(err, accounts.ErrUserNotFound):
		writeProblem(w, r, http.StatusNotFound, "user_not_found")
	case errors.Is(err, accounts.ErrMemberNotFound):
		writeProblem(w, r, http.StatusNotFound, "member_not_found")
	case errors.Is(err, accounts.ErrAlreadyMember):
		writeProblem(w, r, http.StatusConflict, "already_member")
	case errors.Is(err, accounts.ErrLastOwner):
		writeProblem(w, r, http.StatusConflict, "last_organization_owner")
	case errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
		writeProblem(w, r, http.StatusServiceUnavailable, "request_timeout")
	default:
		api.logger.Error("account operation failed", "error", err)
		writeProblem(w, r, http.StatusInternalServerError, "internal_error")
	}
}

func readMembershipUser(w http.ResponseWriter, r *http.Request, value string) (uuid.UUID, bool) {
	id, err := uuid.Parse(value)
	if err != nil || id == uuid.Nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_user_id")
		return uuid.Nil, false
	}
	return id, true
}
