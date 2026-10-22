package httpapi

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strconv"

	"github.com/google/uuid"

	"cascadehook/internal/pagination"
)

// Query keys are allowlisted and singular so clients cannot accidentally rely
// on ignored filters or inconsistent duplicate-parameter interpretations.
func readListQuery(w http.ResponseWriter, r *http.Request, filters ...string) (url.Values, int, bool) {
	if len(r.URL.RawQuery) > 4096 {
		writeProblem(w, r, http.StatusBadRequest, "invalid_pagination")
		return nil, 0, false
	}
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_pagination")
		return nil, 0, false
	}
	for key, values := range query {
		if len(values) != 1 || (key != "limit" && key != "cursor" && !slices.Contains(filters, key)) {
			writeProblem(w, r, http.StatusBadRequest, "invalid_pagination")
			return nil, 0, false
		}
	}
	limit := pagination.DefaultLimit
	if query.Has("limit") {
		limit, err = strconv.Atoi(query.Get("limit"))
		if err != nil || limit < 1 || limit > pagination.MaxLimit {
			writeProblem(w, r, http.StatusBadRequest, "invalid_pagination")
			return nil, 0, false
		}
	}
	return query, limit, true
}

func decodeListCursor(w http.ResponseWriter, r *http.Request, value string, target any) bool {
	if len(value) == 0 || len(value) > 512 {
		writeProblem(w, r, http.StatusBadRequest, "invalid_cursor")
		return false
	}
	data, err := base64.RawURLEncoding.Strict().DecodeString(value)
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_cursor")
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_cursor")
		return false
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		writeProblem(w, r, http.StatusBadRequest, "invalid_cursor")
		return false
	}
	return true
}

func readPageCursor(w http.ResponseWriter, r *http.Request, query url.Values) (*pagination.Cursor, bool) {
	if !query.Has("cursor") {
		return nil, true
	}
	var cursor pagination.Cursor
	if !decodeListCursor(w, r, query.Get("cursor"), &cursor) {
		return nil, false
	}
	if !cursor.Valid() {
		writeProblem(w, r, http.StatusBadRequest, "invalid_cursor")
		return nil, false
	}
	return &cursor, true
}

func writePage[T any](w http.ResponseWriter, r *http.Request, data []T, limit int, cursorFor func(T) any) {
	var nextCursor *string
	if len(data) > limit {
		encoded, err := json.Marshal(cursorFor(data[limit-1]))
		if err != nil {
			writeProblem(w, r, http.StatusInternalServerError, "internal_error")
			return
		}
		value := base64.RawURLEncoding.EncodeToString(encoded)
		nextCursor = &value
		data = data[:limit]
	}
	if data == nil {
		data = make([]T, 0)
	}
	writeJSON(w, r, http.StatusOK, struct {
		Data       []T     `json:"data"`
		NextCursor *string `json:"next_cursor"`
	}{Data: data, NextCursor: nextCursor})
}

func readResourceID(w http.ResponseWriter, r *http.Request, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(r.PathValue(name))
	if err != nil || id == uuid.Nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_"+name)
		return uuid.Nil, false
	}
	return id, true
}

func readUUIDFilter(w http.ResponseWriter, r *http.Request, query url.Values, name string) (*uuid.UUID, bool) {
	if !query.Has(name) {
		return nil, true
	}
	id, err := uuid.Parse(query.Get(name))
	if err != nil || id == uuid.Nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_filter")
		return nil, false
	}
	return &id, true
}
