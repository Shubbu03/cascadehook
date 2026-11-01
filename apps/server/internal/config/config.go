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

	"cascadehook/internal/auth"
	"cascadehook/internal/clerk"
	"cascadehook/internal/deliveries"
	"cascadehook/internal/limits"
	"cascadehook/internal/mailoutbox"
	"cascadehook/internal/retention"
	"cascadehook/internal/telemetry"
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
	HTTPAddr              string
	SigningEncryptionKey  []byte `json:"-"`
	PreviousEncryptionKey []byte `json:"-"`
	Clerk                 auth.ClerkConfig
	RequestLimits         limits.Config
	Metrics               telemetry.Config
	ClerkBackend          clerk.Config
	ClerkWebhookSecrets   []string `json:"-"`
	Email                 mailoutbox.Config
}

type WorkerConfig struct {
	Config
	SigningEncryptionKey   []byte `json:"-"`
	PreviousEncryptionKey  []byte `json:"-"`
	Concurrency            int
	DestinationConcurrency int
	ClaimBatchSize         int
	PollInterval           time.Duration
	Metrics                telemetry.Config
	Email                  mailoutbox.Config
	ClerkBackend           clerk.Config
}

type JanitorConfig struct {
	Config
	Retention     retention.Config
	ClerkDeletion clerk.Config
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
	cfg.PreviousEncryptionKey, err = previousEncryptionKey()
	if err != nil {
		return APIConfig{}, err
	}
	cfg.Clerk = auth.ClerkConfig{
		IssuerURL:    os.Getenv("CLERK_ISSUER_URL"),
		JWTPublicKey: os.Getenv("CLERK_JWT_PUBLIC_KEY"),
	}
	cfg.ClerkBackend = clerk.Config{IssuerURL: cfg.Clerk.IssuerURL, SecretKey: os.Getenv("CLERK_SECRET_KEY")}
	if err := cfg.ClerkBackend.Validate(); err != nil {
		return APIConfig{}, err
	}
	cfg.ClerkWebhookSecrets = make([]string, 0)
	if value := os.Getenv("CLERK_WEBHOOK_SIGNING_SECRETS"); value != "" {
		for _, secret := range strings.Split(value, ",") {
			cfg.ClerkWebhookSecrets = append(cfg.ClerkWebhookSecrets, strings.TrimSpace(secret))
		}
		if cfg.Clerk.IssuerURL == "" {
			return APIConfig{}, fmt.Errorf("CLERK_ISSUER_URL is required for identity webhooks")
		}
	}
	if _, err := clerk.NewWebhook(cfg.ClerkWebhookSecrets); err != nil {
		return APIConfig{}, err
	}
	cfg.Email, err = emailConfig()
	if err != nil {
		return APIConfig{}, err
	}
	if cfg.Email.Enabled() && cfg.ClerkBackend.SecretKey == "" {
		return APIConfig{}, fmt.Errorf("CLERK_SECRET_KEY is required for invitation emails")
	}
	if parties := os.Getenv("CLERK_AUTHORIZED_PARTIES"); parties != "" {
		for _, party := range strings.Split(parties, ",") {
			cfg.Clerk.AuthorizedParties = append(cfg.Clerk.AuthorizedParties, strings.TrimSpace(party))
		}
	}
	cfg.RequestLimits, err = requestLimits()
	if err != nil {
		return APIConfig{}, err
	}
	cfg.Metrics, err = metricsConfig()
	if err != nil {
		return APIConfig{}, err
	}

	return cfg, nil
}

func requestLimits() (limits.Config, error) {
	cfg := limits.Defaults()
	settings := []struct {
		name    string
		value   *int
		maximum int
	}{
		{name: "API_GLOBAL_RPS", value: &cfg.Global.Rate, maximum: limits.MaxRate},
		{name: "API_GLOBAL_BURST", value: &cfg.Global.Burst, maximum: limits.MaxBurst},
		{name: "API_PROJECT_RPS", value: &cfg.Project.Rate, maximum: limits.MaxRate},
		{name: "API_PROJECT_BURST", value: &cfg.Project.Burst, maximum: limits.MaxBurst},
	}
	for _, setting := range settings {
		value, err := boundedInt(
			setting.name,
			*setting.value,
			1,
			setting.maximum,
		)
		if err != nil {
			return limits.Config{}, err
		}
		*setting.value = value
	}
	return cfg, nil
}

func LoadWorker() (WorkerConfig, error) {
	shared, err := Load()
	if err != nil {
		return WorkerConfig{}, err
	}
	cfg := WorkerConfig{Config: shared, PollInterval: time.Second}
	cfg.Email, err = emailConfig()
	if err != nil {
		return WorkerConfig{}, err
	}
	cfg.ClerkBackend = clerk.Config{IssuerURL: os.Getenv("CLERK_ISSUER_URL"), SecretKey: os.Getenv("CLERK_SECRET_KEY")}
	if err := cfg.ClerkBackend.Validate(); err != nil {
		return WorkerConfig{}, err
	}
	if cfg.Email.Enabled() && cfg.ClerkBackend.SecretKey == "" {
		return WorkerConfig{}, fmt.Errorf("CLERK_SECRET_KEY is required for invitation emails")
	}
	cfg.SigningEncryptionKey, err = signingEncryptionKey()
	if err != nil {
		return WorkerConfig{}, err
	}
	cfg.PreviousEncryptionKey, err = previousEncryptionKey()
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
	cfg.Metrics, err = metricsConfig()
	if err != nil {
		return WorkerConfig{}, err
	}
	return cfg, nil
}

func emailConfig() (mailoutbox.Config, error) {
	limit, err := boundedInt("EMAIL_DAILY_LIMIT", 100, 1, 1000000)
	if err != nil {
		return mailoutbox.Config{}, err
	}
	cfg := mailoutbox.Config{
		APIKey: os.Getenv("RESEND_API_KEY"), From: os.Getenv("EMAIL_FROM"),
		WebhookSecret: os.Getenv("RESEND_WEBHOOK_SECRET"), InvitationURL: os.Getenv("INVITATION_ACCEPT_URL"), DailyLimit: limit,
	}
	return cfg, cfg.Validate()
}

func metricsConfig() (telemetry.Config, error) {
	cfg := telemetry.Config{Address: os.Getenv("METRICS_ADDR"), Token: os.Getenv("METRICS_TOKEN")}
	return cfg, cfg.Validate()
}

func signingEncryptionKey() ([]byte, error) {
	key, err := base64.StdEncoding.Strict().DecodeString(os.Getenv("SIGNING_ENCRYPTION_KEY"))
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("SIGNING_ENCRYPTION_KEY must be a base64-encoded 32-byte encryption key")
	}
	return key, nil
}

func previousEncryptionKey() ([]byte, error) {
	value := os.Getenv("SIGNING_ENCRYPTION_PREVIOUS_KEY")
	if value == "" {
		return nil, nil
	}
	key, err := base64.StdEncoding.DecodeString(value)
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("SIGNING_ENCRYPTION_PREVIOUS_KEY must be a base64-encoded 32-byte key")
	}
	return key, nil
}

// Clerk configuration is optional for history cleanup, but required to finish
// requested account erasure. Signing credentials are not used by this job.
func LoadJanitor() (JanitorConfig, error) {
	shared, err := Load()
	if err != nil {
		return JanitorConfig{}, err
	}
	cfg := JanitorConfig{Config: shared, Retention: retention.Defaults()}
	settings := []struct {
		name    string
		value   *int
		minimum int
		maximum int
	}{
		{name: "RETENTION_DAYS", value: &cfg.Retention.Days, minimum: 1, maximum: retention.MaxDays},
		{name: "NOTIFICATION_RETENTION_DAYS", value: &cfg.Retention.NotificationDays, minimum: 1, maximum: retention.MaxDays},
		{name: "JANITOR_BATCH_SIZE", value: &cfg.Retention.BatchSize, minimum: 1, maximum: retention.MaxBatchSize},
		{
			name: "JANITOR_MAX_BATCHES", value: &cfg.Retention.MaxBatches,
			minimum: len(retention.Phases()), maximum: retention.MaxBatches,
		},
	}
	for _, setting := range settings {
		value, err := boundedInt(
			setting.name,
			*setting.value,
			setting.minimum,
			setting.maximum,
		)
		if err != nil {
			return JanitorConfig{}, err
		}
		*setting.value = value
	}
	if value, ok := os.LookupEnv("JANITOR_RUN_TIMEOUT"); ok {
		cfg.Retention.RunTimeout, err = time.ParseDuration(value)
		if err != nil {
			return JanitorConfig{}, fmt.Errorf("JANITOR_RUN_TIMEOUT must be a duration between 10s and 1h")
		}
	}
	if err := cfg.Retention.Validate(); err != nil {
		return JanitorConfig{}, err
	}
	cfg.ClerkDeletion = clerk.Config{
		IssuerURL: os.Getenv("CLERK_ISSUER_URL"), SecretKey: os.Getenv("CLERK_SECRET_KEY"),
	}
	if err := cfg.ClerkDeletion.Validate(); err != nil {
		return JanitorConfig{}, err
	}
	return cfg, nil
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
