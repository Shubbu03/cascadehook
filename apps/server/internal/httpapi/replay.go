package httpapi

import (
	"context"
	"errors"
	"net/http"

	"cascadehook/internal/accounts"
	"cascadehook/internal/auth"
	"cascadehook/internal/controls"
	"cascadehook/internal/deliveries"
)

func (api *api) replayDelivery(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeProblem(w, r, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	id, ok := readResourceID(w, r, "delivery_id")
	if !ok {
		return
	}
	if r.URL.RawQuery != "" {
		writeProblem(w, r, http.StatusBadRequest, "invalid_replay_request")
		return
	}
	var body struct {
		ExpectedCycle *int `json:"expected_cycle"`
	}
	if err := readJSON(w, r, &body); err != nil {
		jsonProblem(w, r, err)
		return
	}
	if body.ExpectedCycle == nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_replay_cycle")
		return
	}
	receipt, err := api.db.ReplayDelivery(r.Context(), principal, id, *body.ExpectedCycle)
	if err != nil {
		api.replayProblem(w, r, err)
		return
	}
	if receipt.Replayed {
		w.Header().Set("Idempotent-Replay", "true")
	} else {
		api.logger.Info("delivery replay accepted", "replay_id", receipt.ID, "delivery_id", receipt.DeliveryID,
			"project_id", principal.ProjectID, "api_key_id", principal.APIKeyID, "user_id", principal.UserID,
			"from_cycle", receipt.FromCycle, "cycle", receipt.Cycle)
	}
	w.Header().Set("Location", projectResourceLocation(r, "deliveries/"+id.String()))
	writeJSON(w, r, http.StatusAccepted, receipt)
}

func (api *api) replayProblem(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, accounts.ErrAccountDeleted):
		api.accountProblem(w, r, err)
	case errors.Is(err, controls.ErrSuspended), errors.Is(err, controls.ErrProjectNotFound):
		api.projectControlProblem(w, r, err)
	case errors.Is(err, accounts.ErrNotFound), errors.Is(err, accounts.ErrForbidden):
		api.accountProblem(w, r, err)
	case errors.Is(err, deliveries.ErrNotFound):
		writeProblem(w, r, http.StatusNotFound, "delivery_not_found")
	case errors.Is(err, deliveries.ErrInvalidReplayCycle):
		writeProblem(w, r, http.StatusBadRequest, "invalid_replay_cycle")
	case errors.Is(err, deliveries.ErrReplayCycleChanged):
		writeProblem(w, r, http.StatusConflict, "delivery_cycle_changed")
	case errors.Is(err, deliveries.ErrReplayNotAllowed):
		writeProblem(w, r, http.StatusConflict, "delivery_not_replayable")
	case errors.Is(err, deliveries.ErrReplayEndpointNotReady):
		writeProblem(w, r, http.StatusConflict, "replay_endpoint_not_ready")
	case errors.Is(err, deliveries.ErrReplayCycleLimit):
		writeProblem(w, r, http.StatusConflict, "delivery_cycle_limit_reached")
	case errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
		writeProblem(w, r, http.StatusServiceUnavailable, "request_timeout")
	default:
		api.logger.Error("delivery replay failed", "error", err)
		writeProblem(w, r, http.StatusInternalServerError, "internal_error")
	}
}
