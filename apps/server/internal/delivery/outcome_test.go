package delivery

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"
	"time"

	"cascadehook/internal/deliveries"
)

type timeoutError struct{}

func (timeoutError) Error() string   { return "i/o timeout" }
func (timeoutError) Timeout() bool   { return true }
func (timeoutError) Temporary() bool { return true }

func TestClassifyOutcomes(t *testing.T) {
	delays := deliveries.DefaultPolicy().RetryDelaysSeconds
	tests := []struct {
		name      string
		response  Response
		err       error
		outcome   deliveries.Outcome
		errorCode string
	}{
		{name: "200", response: Response{StatusCode: 200}, outcome: deliveries.OutcomeSucceeded},
		{name: "204", response: Response{StatusCode: 204}, outcome: deliveries.OutcomeSucceeded},
		{name: "redirect is terminal", response: Response{StatusCode: 302}, outcome: deliveries.OutcomeTerminal, errorCode: "http_status"},
		{name: "400", response: Response{StatusCode: 400}, outcome: deliveries.OutcomeTerminal, errorCode: "http_status"},
		{name: "404", response: Response{StatusCode: 404}, outcome: deliveries.OutcomeTerminal, errorCode: "http_status"},
		{name: "408", response: Response{StatusCode: 408}, outcome: deliveries.OutcomeRetryable, errorCode: "http_status"},
		{name: "429", response: Response{StatusCode: 429}, outcome: deliveries.OutcomeRetryable, errorCode: "http_status"},
		{name: "500", response: Response{StatusCode: 500}, outcome: deliveries.OutcomeRetryable, errorCode: "http_status"},
		{name: "503", response: Response{StatusCode: 503}, outcome: deliveries.OutcomeRetryable, errorCode: "http_status"},
		{name: "unsafe destination", err: fmt.Errorf("dial: %w", ErrUnsafeDestination), outcome: deliveries.OutcomeTerminal, errorCode: "unsafe_destination"},
		{name: "shutdown", err: context.Canceled, outcome: deliveries.OutcomeInterrupted, errorCode: "worker_shutdown"},
		{name: "deadline", err: context.DeadlineExceeded, outcome: deliveries.OutcomeRetryable, errorCode: "timeout"},
		{name: "network timeout", err: timeoutError{}, outcome: deliveries.OutcomeRetryable, errorCode: "timeout"},
		{name: "network error", err: errors.New("connection refused"), outcome: deliveries.OutcomeRetryable, errorCode: "network_error"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result := ClassifyWithDelays(test.response, test.err, 1, time.Millisecond, delays)
			if result.Outcome != test.outcome || result.ErrorCode != test.errorCode {
				t.Fatalf("got %s/%q, want %s/%q", result.Outcome, result.ErrorCode, test.outcome, test.errorCode)
			}
			if err := result.Validate(); err != nil {
				t.Fatalf("classified result is not persistable: %v", err)
			}
			if (result.RetryDelay > 0) != (test.outcome == deliveries.OutcomeRetryable) {
				t.Fatalf("retry delay %s does not match outcome %s", result.RetryDelay, result.Outcome)
			}
		})
	}
}

func TestClassifyBackoffStaysWithinJitterAndClampsAttempt(t *testing.T) {
	delays := []int{10, 100, 1000}
	for attempt, base := range map[int]time.Duration{0: 10 * time.Second, 1: 10 * time.Second, 3: 1000 * time.Second, 9: 1000 * time.Second} {
		for range 50 {
			delay := ClassifyWithDelays(Response{StatusCode: 500}, nil, attempt, 0, delays).RetryDelay
			if delay < base*4/5 || delay > base*6/5 {
				t.Fatalf("attempt %d: delay %s outside ±20%% of %s", attempt, delay, base)
			}
		}
	}
}

func TestClassifyRetryAfter(t *testing.T) {
	delays := deliveries.DefaultPolicy().RetryDelaysSeconds
	classify := func(value string) deliveries.Result {
		return ClassifyWithDelays(Response{StatusCode: 503, RetryAfter: value}, nil, 1, 0, delays)
	}
	if got := classify(" 90 ").RetryAfterDelay; got != 90*time.Second {
		t.Fatalf("seconds form: got %s", got)
	}
	if got := classify("99999999999999999999999").RetryAfterDelay; got != deliveries.RetryHorizon {
		t.Fatalf("overflow should clamp to the horizon, got %s", got)
	}
	at := time.Date(2030, 1, 2, 3, 4, 5, 0, time.UTC)
	if got := classify(at.Format(http.TimeFormat)).RetryAfterAt; got == nil || !got.Equal(at) {
		t.Fatalf("date form: got %v", got)
	}
	for _, ignored := range []string{"", "soon", "-5", "1.5"} {
		result := classify(ignored)
		if result.RetryAfterDelay != 0 || result.RetryAfterAt != nil {
			t.Fatalf("%q should be ignored: %+v", ignored, result)
		}
	}
	if result := ClassifyWithDelays(Response{StatusCode: 400, RetryAfter: "90"}, nil, 1, 0, delays); result.RetryAfterDelay != 0 {
		t.Fatalf("terminal outcome kept a retry hint: %+v", result)
	}
}

func TestClassifyFlagsResponseReadError(t *testing.T) {
	delays := deliveries.DefaultPolicy().RetryDelaysSeconds
	result := ClassifyWithDelays(Response{StatusCode: 200, Truncated: true}, errors.New("body reset"), 1, -time.Second, delays)
	if result.Outcome != deliveries.OutcomeSucceeded || !result.ResponseReadError || !result.ResponseTruncated || result.Duration != 0 {
		t.Fatalf("unexpected result: %+v", result)
	}
}
