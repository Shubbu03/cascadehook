package httpapi

import (
	"context"
	"errors"
	"math"
	"net/http"
	"strconv"

	"cascadehook/internal/auth"
	"cascadehook/internal/deliveries"
	"cascadehook/internal/events"
	"cascadehook/internal/pagination"
)

func (api *api) listEvents(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	query, limit, ok := readListQuery(w, r, "event_type")
	if !ok {
		return
	}
	eventType := query.Get("event_type")
	if query.Has("event_type") && !events.ValidType(eventType) {
		writeProblem(
			w,
			r,
			http.StatusBadRequest,
			"invalid_filter",
		)
		return
	}
	before, ok := readPageCursor(w, r, query)
	if !ok {
		return
	}
	result, err := api.db.ListEvents(r.Context(), principal.ProjectID, events.ListOptions{
		Limit: limit, Before: before, EventType: eventType,
	})
	if err != nil {
		api.readProblem(w, r, err)
		return
	}
	writePage(
		w,
		r,
		result,
		limit,
		func(event events.Summary) any {
			return pagination.Cursor{CreatedAt: event.CreatedAt, ID: event.ID}
		},
	)
}

func (api *api) eventResource(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	if !allowGetHead(w, r) {
		return
	}
	id, ok := readResourceID(w, r, "event_id")
	if !ok {
		return
	}
	event, err := api.db.GetEvent(r.Context(), principal.ProjectID, id)
	if err != nil {
		api.readProblem(w, r, err)
		return
	}
	writeJSON(
		w,
		r,
		http.StatusOK,
		event,
	)
}

func (api *api) deliveryCollection(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	if !allowGetHead(w, r) {
		return
	}
	query, limit, ok := readListQuery(
		w,
		r,
		"event_id",
		"endpoint_id",
		"state",
	)
	if !ok {
		return
	}
	eventID, ok := readUUIDFilter(
		w,
		r,
		query,
		"event_id",
	)
	if !ok {
		return
	}
	endpointID, ok := readUUIDFilter(
		w,
		r,
		query,
		"endpoint_id",
	)
	if !ok {
		return
	}
	state := deliveries.State(query.Get("state"))
	if query.Has("state") && !deliveries.ValidState(state) {
		writeProblem(
			w,
			r,
			http.StatusBadRequest,
			"invalid_filter",
		)
		return
	}
	before, ok := readPageCursor(w, r, query)
	if !ok {
		return
	}
	result, err := api.db.ListDeliveries(r.Context(), principal.ProjectID, deliveries.ListOptions{
		Limit: limit, Before: before, EventID: eventID, EndpointID: endpointID, State: state,
	})
	if err != nil {
		api.readProblem(w, r, err)
		return
	}
	writePage(
		w,
		r,
		result,
		limit,
		func(delivery deliveries.Delivery) any {
			return pagination.Cursor{CreatedAt: delivery.CreatedAt, ID: delivery.ID}
		},
	)
}

func (api *api) deliveryResource(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	if !allowGetHead(w, r) {
		return
	}
	id, ok := readResourceID(w, r, "delivery_id")
	if !ok {
		return
	}
	delivery, err := api.db.GetDelivery(r.Context(), principal.ProjectID, id)
	if err != nil {
		api.readProblem(w, r, err)
		return
	}
	writeJSON(
		w,
		r,
		http.StatusOK,
		delivery,
	)
}

func (api *api) deliveryAttempts(w http.ResponseWriter, r *http.Request, principal auth.Principal) {
	if !allowGetHead(w, r) {
		return
	}
	id, ok := readResourceID(w, r, "delivery_id")
	if !ok {
		return
	}
	query, limit, ok := readListQuery(w, r, "cycle")
	if !ok {
		return
	}
	options := deliveries.AttemptListOptions{Limit: limit}
	if query.Has("cycle") {
		cycle, err := strconv.Atoi(query.Get("cycle"))
		if err != nil || cycle < 0 || cycle > math.MaxInt32 {
			writeProblem(
				w,
				r,
				http.StatusBadRequest,
				"invalid_filter",
			)
			return
		}
		options.Cycle = &cycle
	}
	if query.Has("cursor") {
		var cursor deliveries.AttemptCursor
		if !decodeListCursor(
			w,
			r,
			query.Get("cursor"),
			&cursor,
		) {
			return
		}
		if !cursor.Valid(id) || (options.Cycle != nil && cursor.Cycle != *options.Cycle) {
			writeProblem(
				w,
				r,
				http.StatusBadRequest,
				"invalid_cursor",
			)
			return
		}
		options.Before = &cursor
	}
	result, err := api.db.ListDeliveryAttempts(
		r.Context(),
		principal.ProjectID,
		id,
		options,
	)
	if err != nil {
		api.readProblem(w, r, err)
		return
	}
	writePage(
		w,
		r,
		result,
		limit,
		func(attempt deliveries.AttemptRecord) any {
			return deliveries.AttemptCursor{DeliveryID: id, Cycle: attempt.Cycle, AttemptNumber: attempt.AttemptNumber}
		},
	)
}

func (api *api) readProblem(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, events.ErrNotFound):
		writeProblem(
			w,
			r,
			http.StatusNotFound,
			"event_not_found",
		)
	case errors.Is(err, deliveries.ErrNotFound):
		writeProblem(
			w,
			r,
			http.StatusNotFound,
			"delivery_not_found",
		)
	case errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
		writeProblem(
			w,
			r,
			http.StatusServiceUnavailable,
			"request_timeout",
		)
	default:
		api.logger.Error("resource read failed", "error", err)
		writeProblem(
			w,
			r,
			http.StatusInternalServerError,
			"internal_error",
		)
	}
}
