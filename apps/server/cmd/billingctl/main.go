// billingctl has operator database access only; there is no customer recovery route.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	"cascadehook/internal/billing"
	"cascadehook/internal/config"
	"cascadehook/internal/store"
	"github.com/google/uuid"
)

func main() {
	if err := run(); err != nil {
		slog.Error("billing command failed", "error", err)
		os.Exit(1)
	}
}
func run() error {
	if len(os.Args) < 2 {
		return fmt.Errorf("usage: billingctl <status|reconcile|clear-checkout> --organization UUID")
	}
	action := os.Args[1]
	flags := flag.NewFlagSet("billingctl "+action, flag.ContinueOnError)
	org := flags.String("organization", "", "organization UUID")
	subscription := flags.String("subscription", "", "authoritative Dodo subscription ID; reconcile only")
	checkout := flags.String("expected-checkout", "", "checkout UUID from status; clear-checkout only")
	operator := flags.String("operator", "", "operator audit label; clear-checkout only")
	reference := flags.String("provider-reference", "", "Dodo evidence reference confirming checkout expired/disabled and no purchase; clear-checkout only")
	confirmed := flags.Bool("confirmed-no-purchase", false, "Dodo was checked manually: checkout cannot complete and no successful payment/subscription exists")
	if err := flags.Parse(os.Args[2:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("unexpected positional arguments")
	}
	id, err := uuid.Parse(*org)
	if err != nil || id == uuid.Nil {
		return fmt.Errorf("organization UUID required")
	}
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	switch action {
	case "status":
	case "reconcile":
		bc, err := config.LoadBilling()
		if err != nil {
			return err
		}
		provider, err := billing.NewProvider(bc)
		if err != nil {
			return err
		}
		if provider == nil {
			return billing.ErrUnavailable
		}
		defer provider.Close()
		if err = db.SyncBilling(ctx, id, *subscription, "", provider, true); err != nil {
			return err
		}
	case "clear-checkout":
		if !*confirmed {
			return fmt.Errorf("inspect Dodo first; --confirmed-no-purchase is required")
		}
		expected, err := uuid.Parse(*checkout)
		if err != nil {
			return err
		}
		if err = db.ClearBillingCheckout(ctx, id, expected, *operator, *reference); err != nil {
			return err
		}
	default:
		return fmt.Errorf("action must be status, reconcile, or clear-checkout")
	}
	status, err := db.OperatorBillingStatus(ctx, id)
	if err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(status)
}
