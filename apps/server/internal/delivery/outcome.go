package delivery

import (
	"context"
	"errors"
	"math/rand/v2"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"cascadehook/internal/deliveries"
)

// Eight total attempts have seven retry intervals. Retry-After can extend an
// interval, but cannot make it shorter than this jittered backoff.
var retrySchedule = [...]time.Duration{
	15 * time.Second, time.Minute, 5 * time.Minute, 30 * time.Minute,
	2 * time.Hour, 6 * time.Hour, 18 * time.Hour,
}

func Classify(response Response, err error, attemptNumber int, elapsed time.Duration) deliveries.Result {
	result := deliveries.Result{
		StatusCode: response.StatusCode, Duration: max(elapsed, 0),
		ResponseTruncated: response.Truncated,
		ResponseReadError: response.StatusCode != 0 && err != nil,
	}
	switch {
	case response.StatusCode >= 200 && response.StatusCode < 300:
		result.Outcome = deliveries.OutcomeSucceeded
		return result
	case response.StatusCode != 0:
		result.ErrorCode = "http_status"
		if response.StatusCode == 408 || response.StatusCode == 429 || (response.StatusCode >= 500 && response.StatusCode < 600) {
			result.Outcome = deliveries.OutcomeRetryable
		} else {
			result.Outcome = deliveries.OutcomeTerminal
		}
	case errors.Is(err, ErrUnsafeDestination):
		result.Outcome, result.ErrorCode = deliveries.OutcomeTerminal, "unsafe_destination"
	case errors.Is(err, context.Canceled):
		result.Outcome, result.ErrorCode = deliveries.OutcomeInterrupted, "worker_shutdown"
	default:
		result.Outcome, result.ErrorCode = deliveries.OutcomeRetryable, "network_error"
		var networkError net.Error
		if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &networkError) && networkError.Timeout()) {
			result.ErrorCode = "timeout"
		}
	}
	if result.Outcome == deliveries.OutcomeRetryable {
		index := min(max(attemptNumber-1, 0), len(retrySchedule)-1)
		base := retrySchedule[index]
		spread := base / 5
		result.RetryDelay = base - spread + time.Duration(rand.Int64N(int64(2*spread)+1))
		parseRetryAfter(response.RetryAfter, &result)
	}
	return result
}

func parseRetryAfter(value string, result *deliveries.Result) {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 128 {
		return
	}
	digits := true
	for _, ch := range value {
		if ch < '0' || ch > '9' {
			digits = false
			break
		}
	}
	if digits {
		seconds, err := strconv.ParseUint(value, 10, 64)
		if err != nil || seconds >= uint64(deliveries.RetryHorizon/time.Second) {
			result.RetryAfterDelay = deliveries.RetryHorizon
		} else {
			result.RetryAfterDelay = time.Duration(seconds) * time.Second
		}
		return
	}
	if at, err := http.ParseTime(value); err == nil {
		result.RetryAfterAt = &at
	}
}
