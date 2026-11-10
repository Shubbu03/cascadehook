package deliveries

import "errors"

var ErrInvalidPolicy = errors.New("invalid delivery policy")

type Policy struct {
	MaxAttempts        int   `json:"max_attempts"`
	TimeoutSeconds     int   `json:"timeout_seconds"`
	RetryDelaysSeconds []int `json:"retry_delays_seconds"`
}

func DefaultPolicy() Policy {
	return Policy{MaxAttempts: MaxAttempts, TimeoutSeconds: int(AttemptTimeout.Seconds()),
		RetryDelaysSeconds: []int{15, 60, 300, 1800, 7200, 21600, 64800}}
}

func (policy Policy) Validate() error {
	validAttempts := policy.MaxAttempts >= 1 && policy.MaxAttempts <= MaxAttempts
	validTimeout := policy.TimeoutSeconds >= 1 && policy.TimeoutSeconds <= int(AttemptTimeout.Seconds())
	if !validAttempts || !validTimeout || len(policy.RetryDelaysSeconds) != MaxAttempts-1 {
		return ErrInvalidPolicy
	}
	for index, seconds := range policy.RetryDelaysSeconds {
		if seconds < 1 || seconds > 64800 {
			return ErrInvalidPolicy
		}
		if index > 0 && seconds < policy.RetryDelaysSeconds[index-1] {
			return ErrInvalidPolicy
		}
	}
	return nil
}
