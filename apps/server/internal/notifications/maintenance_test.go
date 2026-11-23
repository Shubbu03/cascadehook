package notifications

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
)

type failingExpirySource struct {
	cancel                    context.CancelFunc
	expiryCalls, warningCalls int
}

func (source *failingExpirySource) GenerateKeyExpiryNotifications(context.Context, int) (int, error) {
	source.expiryCalls++
	return 0, errors.New("expiry lookup unavailable")
}

func (source *failingExpirySource) GenerateDeliveryRetryWarnings(context.Context, int) (int, error) {
	source.warningCalls++
	source.cancel()
	return 1, nil
}

func TestMaintenanceGeneratesRetryWarningsWhenExpiryLookupFails(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	source := &failingExpirySource{cancel: cancel}
	RunMaintenance(ctx, source, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if source.expiryCalls != 1 || source.warningCalls != 1 {
		t.Fatalf("expiry failure blocked retry warnings: %+v", source)
	}
}
