package delivery

import (
	"testing"
	"time"

	"cascadehook/internal/deliveries"
)

func TestCustomBackoffKeepsJitterAndRetryAfter(t *testing.T) {
	delays := []int{2, 4, 8, 16, 32, 64, 128}
	for range 25 {
		result := ClassifyWithDelays(Response{StatusCode: 500}, nil, 2, time.Millisecond, delays)
		if result.Outcome != deliveries.OutcomeRetryable || result.RetryDelay < 3200*time.Millisecond || result.RetryDelay > 4800*time.Millisecond {
			t.Fatalf("custom backoff not used: %+v", result)
		}
	}
	result := ClassifyWithDelays(Response{StatusCode: 429, RetryAfter: "120"}, nil, 1, time.Millisecond, delays)
	now := time.Now()
	if result.RetryAt(now).Sub(now) != 120*time.Second {
		t.Fatalf("retry-after was shortened: %+v", result)
	}
}
