// Package limits defines request budgets independently of HTTP and persistence.
package limits

import (
	"fmt"
	"math"
	"sync"
	"time"
)

const (
	MaxRate  = 100000
	MaxBurst = 1000000
)

type Budget struct {
	Rate  int
	Burst int
}

func (budget Budget) Validate() error {
	if budget.Rate < 1 || budget.Rate > MaxRate {
		return fmt.Errorf("request rate must be between 1 and 100000 per second")
	}
	if budget.Burst < 1 || budget.Burst > MaxBurst {
		return fmt.Errorf("request burst must be between 1 and 1000000")
	}
	return nil
}

type Config struct {
	Global  Budget
	Project Budget
}

func Defaults() Config {
	return Config{
		Global:  Budget{Rate: 200, Burst: 400},
		Project: Budget{Rate: 20, Burst: 40},
	}
}

type Limiter struct {
	mu         sync.Mutex
	config     Config
	tokens     float64
	refilledAt time.Time
}

func New(cfg Config) (*Limiter, error) {
	if err := cfg.Global.Validate(); err != nil {
		return nil, fmt.Errorf("global limit: %w", err)
	}
	if err := cfg.Project.Validate(); err != nil {
		return nil, fmt.Errorf("project limit: %w", err)
	}
	return &Limiter{config: cfg, tokens: float64(cfg.Global.Burst), refilledAt: time.Now()}, nil
}

// AllowGlobal consumes one token or returns the minimum wait. The single
// bucket bounds memory and uses monotonic time; it is local to this API process.
func (limiter *Limiter) AllowGlobal() time.Duration {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	now := time.Now()
	rate := float64(limiter.config.Global.Rate)
	refilled := limiter.tokens + now.Sub(limiter.refilledAt).Seconds()*rate
	limiter.tokens = min(float64(limiter.config.Global.Burst), refilled)
	limiter.refilledAt = now
	if limiter.tokens >= 1 {
		limiter.tokens--
		return 0
	}
	return time.Duration(math.Ceil((1 - limiter.tokens) / rate * float64(time.Second)))
}

func (limiter *Limiter) ProjectBudget() Budget {
	return limiter.config.Project
}
