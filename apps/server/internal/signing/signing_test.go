package signing

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"testing"
)

func TestSecretRedaction(t *testing.T) {
	secret, err := NewSecret()
	if err != nil {
		t.Fatal(err)
	}
	const redacted = "[redacted signing secret]"
	for _, value := range []any{secret, &secret} {
		for _, format := range []string{"%v", "%+v", "%#v"} {
			if got := fmt.Sprintf(format, value); got != redacted {
				t.Errorf("format %q did not redact signing secret", format)
			}
		}
	}
	for _, newHandler := range []func(*bytes.Buffer) slog.Handler{
		func(out *bytes.Buffer) slog.Handler { return slog.NewJSONHandler(out, nil) },
		func(out *bytes.Buffer) slog.Handler { return slog.NewTextHandler(out, nil) },
	} {
		var out bytes.Buffer
		slog.New(newHandler(&out)).Info("signing", "secret", secret)
		if !bytes.Contains(out.Bytes(), []byte(redacted)) {
			t.Error("structured log did not redact signing secret")
		}
	}
	encoded, err := json.Marshal(secret)
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != "{}" {
		t.Error("JSON must exclude secret bytes")
	}
}
