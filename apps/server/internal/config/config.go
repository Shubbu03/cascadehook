package config

import (
	"encoding/base64"
	"fmt"
	"log/slog"
	"net"
	"os"
	"strconv"
	"strings"
	"time"

	"cascadehook/internal/deliveries"
)

// Config holds settings shared by the API and worker binaries.
type Config struct {
	DatabaseURL     string
	LogLevel        slog.Level
	ShutdownTimeout time.Duration
}

// APIConfig adds the HTTP listener settings used only by the API binary.
type APIConfig struct {
	Config
	HTTPAddr             string
	SigningEncryptionKey []byte `json:"-"`
}

type WorkerConfig struct {
	Config
	SigningEncryptionKey   []byte `json:"-"`
	Concurrency            int
	DestinationConcurrency int
	ClaimBatchSize         int
	PollInterval           time.Duration
}

// Load reads the shared environment variables once at startup. An explicitly
// empty value is invalid, rather than silently falling back to a default.
func Load() (Config, error) {
	cfg := Config{
		LogLevel:        slog.LevelInfo,
		ShutdownTimeout: 10 * time.Second,
	}

	if value := os.Getenv("DATABASE_URL"); value != "" {
		cfg.DatabaseURL = value
	} else {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}

	if value, ok := os.LookupEnv("LOG_LEVEL"); ok {
		switch strings.ToLower(value) {
		case "debug":
			cfg.LogLevel = slog.LevelDebug
		case "info":
			cfg.LogLevel = slog.LevelInfo
		case "warn":
			cfg.LogLevel = slog.LevelWarn
		case "error":
			cfg.LogLevel = slog.LevelError
		default:
			return Config{}, fmt.Errorf("LOG_LEVEL must be debug, info, warn, or error")
		}
	}

	if value, ok := os.LookupEnv("SHUTDOWN_TIMEOUT"); ok {
		timeout, err := time.ParseDuration(value)
		if err != nil || timeout <= 0 {
			return Config{}, fmt.Errorf("SHUTDOWN_TIMEOUT must be a positive duration, such as 10s")
		}
		cfg.ShutdownTimeout = timeout
	}

	return cfg, nil
}

// LoadAPI reads the shared settings plus the API's HTTP listener address.
func LoadAPI() (APIConfig, error) {
	shared, err := Load()
	if err != nil {
		return APIConfig{}, err
	}
	cfg := APIConfig{
		Config:   shared,
		HTTPAddr: "127.0.0.1:8080",
	}

	if value, ok := os.LookupEnv("HTTP_ADDR"); ok {
		cfg.HTTPAddr = value
	}
	host, port, err := net.SplitHostPort(cfg.HTTPAddr)
	if err != nil || strings.ContainsAny(host, " \t\r\n") {
		return APIConfig{}, fmt.Errorf("HTTP_ADDR must be a host:port address")
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return APIConfig{}, fmt.Errorf("HTTP_ADDR port must be between 1 and 65535")
	}
	key, err := signingEncryptionKey()
	if err != nil {
		return APIConfig{}, err
	}
	cfg.SigningEncryptionKey = key

	return cfg, nil
}

func LoadWorker() (WorkerConfig, error) {
	shared, err := Load()
	if err != nil {
		return WorkerConfig{}, err
	}
	cfg := WorkerConfig{Config: shared, PollInterval: time.Second}
	cfg.SigningEncryptionKey, err = signingEncryptionKey()
	if err != nil {
		return WorkerConfig{}, err
	}
	cfg.Concurrency, err = boundedInt("WORKER_CONCURRENCY", deliveries.DefaultConcurrency, 1, deliveries.MaxConcurrency)
	if err != nil {
		return WorkerConfig{}, err
	}
	cfg.DestinationConcurrency, err = boundedInt("WORKER_DESTINATION_CONCURRENCY", min(deliveries.DefaultDestinationConcurrency, cfg.Concurrency), 1, cfg.Concurrency)
	if err != nil {
		return WorkerConfig{}, err
	}
	cfg.ClaimBatchSize, err = boundedInt("WORKER_CLAIM_BATCH_SIZE", deliveries.DefaultClaimBatch, 1, deliveries.MaxClaimBatch)
	if err != nil {
		return WorkerConfig{}, err
	}
	if value, ok := os.LookupEnv("WORKER_POLL_INTERVAL"); ok {
		cfg.PollInterval, err = time.ParseDuration(value)
		if err != nil || cfg.PollInterval < 100*time.Millisecond || cfg.PollInterval > time.Minute {
			return WorkerConfig{}, fmt.Errorf("WORKER_POLL_INTERVAL must be between 100ms and 1m")
		}
	}
	return cfg, nil
}

func signingEncryptionKey() ([]byte, error) {
	key, err := base64.StdEncoding.Strict().DecodeString(os.Getenv("SIGNING_ENCRYPTION_KEY"))
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("SIGNING_ENCRYPTION_KEY must be a base64-encoded 32-byte encryption key")
	}
	return key, nil
}

func boundedInt(name string, fallback, minimum, maximum int) (int, error) {
	value, ok := os.LookupEnv(name)
	if !ok {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < minimum || parsed > maximum {
		return 0, fmt.Errorf("%s must be between %d and %d", name, minimum, maximum)
	}
	return parsed, nil
}
