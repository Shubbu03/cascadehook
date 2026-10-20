package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
)

var errUnsupportedMediaType = errors.New("application/json is required")

func readJSON(w http.ResponseWriter, r *http.Request, target any) error {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return errUnsupportedMediaType
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err != nil {
			return err
		}
		return errors.New("a single JSON object is required")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, r *http.Request, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		_ = json.NewEncoder(w).Encode(value)
	}
}

func jsonProblem(w http.ResponseWriter, r *http.Request, err error) {
	var tooLarge *http.MaxBytesError
	switch {
	case errors.Is(err, errUnsupportedMediaType):
		writeProblem(w, r, http.StatusUnsupportedMediaType, "unsupported_media_type")
	case errors.As(err, &tooLarge):
		writeProblem(w, r, http.StatusRequestEntityTooLarge, "request_too_large")
	default:
		writeProblem(w, r, http.StatusBadRequest, "invalid_json")
	}
}

// optional distinguishes omitted PATCH fields from explicit zero values and
// rejects null, since URL, enabled, and subscriptions are not nullable fields.
type optional[T any] struct {
	Set   bool
	Value T
}

func (field *optional[T]) UnmarshalJSON(data []byte) error {
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		return errors.New("field must not be null")
	}
	field.Set = true
	return json.Unmarshal(data, &field.Value)
}
