// Package telemetry owns process-local metrics and their private HTTP listener.
package telemetry

import (
	"fmt"
	"net"
	"strconv"
	"strings"
)

type Config struct {
	Address string
	Token   string `json:"-"`
}

func (cfg Config) Enabled() bool {
	return cfg.Address != ""
}

func (cfg Config) Validate() error {
	if cfg.Address == "" && cfg.Token == "" {
		return nil
	}
	host, port, err := net.SplitHostPort(cfg.Address)
	if err != nil || strings.ContainsAny(host, " \t\r\n") {
		return fmt.Errorf("METRICS_ADDR must be a host:port address when metrics are enabled")
	}
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		return fmt.Errorf("METRICS_ADDR port must be between 1 and 65535")
	}
	if len(cfg.Token) < 32 || len(cfg.Token) > 256 {
		return fmt.Errorf("METRICS_TOKEN must contain 32 to 256 non-space ASCII characters")
	}
	for _, char := range []byte(cfg.Token) {
		if char < 33 || char > 126 {
			return fmt.Errorf("METRICS_TOKEN must contain 32 to 256 non-space ASCII characters")
		}
	}
	return nil
}
