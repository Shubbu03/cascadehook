"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { CopyButton } from "@/components/copy-button";

// Each snippet mirrors the checks the verifier performs: exact raw bytes,
// decoded key, five-minute timestamp tolerance, and a constant-time compare.
const snippets = [
  {
    id: "node",
    label: "Node.js",
    note: "With Express, read the body with express.raw({ type: \"application/json\" }) so rawBody is the original Buffer.",
    code: `import { createHmac, timingSafeEqual } from "node:crypto";

// rawBody must be the exact bytes received (a Buffer), not re-serialized JSON.
export function verifyWebhook(rawBody, headers, secret) {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"] ?? "";
  const signatures = headers["webhook-signature"] ?? "";
  if (!id || !/^\\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(\`\${id}.\${timestamp}.\`)
    .update(rawBody)
    .digest();

  return signatures.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const candidate = Buffer.from(value, "base64");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}`,
  },
  {
    id: "python",
    label: "Python",
    note: "Pass request.get_data() in Flask or request.body in Django, before reading request.json.",
    code: `import base64
import hashlib
import hmac
import time


def verify_webhook(raw_body: bytes, headers, secret: str) -> bool:
    msg_id = headers.get("webhook-id", "")
    timestamp = headers.get("webhook-timestamp", "")
    signatures = headers.get("webhook-signature", "")
    if not msg_id or not (timestamp.isascii() and timestamp.isdigit()):
        return False
    if abs(time.time() - int(timestamp)) > 300:
        return False

    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()

    return any(
        hmac.compare_digest(entry.removeprefix("v1,"), expected)
        for entry in signatures.split()
        if entry.startswith("v1,")
    )`,
  },
  {
    id: "go",
    label: "Go",
    note: "Read the body with io.ReadAll (behind http.MaxBytesReader) and verify before json.Unmarshal.",
    code: `package webhooks

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// body must be the exact bytes read from the request, before any JSON decoding.
func Verify(body []byte, header http.Header, secret string) bool {
	id := header.Get("Webhook-Id")
	timestamp := header.Get("Webhook-Timestamp")
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if id == "" || err != nil {
		return false
	}
	if age := time.Since(time.Unix(seconds, 0)); age > 5*time.Minute || age < -5*time.Minute {
		return false
	}

	key, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(id + "." + timestamp + "."))
	mac.Write(body)
	expected := mac.Sum(nil)

	for _, entry := range strings.Fields(header.Get("Webhook-Signature")) {
		value, ok := strings.CutPrefix(entry, "v1,")
		if !ok {
			continue
		}
		candidate, err := base64.StdEncoding.DecodeString(value)
		if err == nil && hmac.Equal(candidate, expected) {
			return true
		}
	}
	return false
}`,
  },
] as const;

export function VerificationCode() {
  const id = useId();
  const [language, setLanguage] = useState<(typeof snippets)[number]["id"]>("node");
  const selected = snippets.find((snippet) => snippet.id === language)!;

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = snippets.findIndex((snippet) => snippet.id === language);
    const next = event.key === "Home" ? 0 : event.key === "End" ? snippets.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + snippets.length) % snippets.length;
    setLanguage(snippets[next].id);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-language="${snippets[next].id}"]`)?.focus();
  }

  return (
    <div className="min-w-0 rounded-[14px] bg-surface overflow-clip border border-solid border-border">
      <div data-ui="landing-code-header" className="flex items-center justify-between flex-wrap pr-3 pl-4 border-b [border-bottom-style:solid] border-b-border text-muted text-[12px] gap-2 py-2.5 max-[37.5rem]:px-2.5">
        <div className="flex items-center gap-1 [&_button]:min-h-9 [&_button]:rounded-[5px] [&_button]:bg-transparent [&_button]:text-muted [&_button]:text-[12px] [&_button]:py-1.75 [&_button]:px-3 [&_button]:border-0 max-[37.5rem]:[&_button]:px-2.5 pointer-coarse:[&_button]:min-h-11 [&_button[aria-selected='true']]:bg-surface-hover [&_button[aria-selected='true']]:text-foreground" role="tablist" aria-label="Language" onKeyDown={navigate}>
          {snippets.map((snippet) => (
            <button key={snippet.id} type="button" role="tab" id={`${id}-${snippet.id}`} data-language={snippet.id}
              aria-controls={`${id}-panel`} aria-selected={snippet.id === language} tabIndex={snippet.id === language ? 0 : -1}
              onClick={() => setLanguage(snippet.id)}>
              {snippet.label}
            </button>
          ))}
        </div>
        <CopyButton key={language} value={selected.code} label="Copy code" />
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${language}`} tabIndex={0}>
        <pre className="m-0 overflow-x-auto px-5 py-6 text-[12px] leading-[1.85] tab-4 max-[37.5rem]:px-3.75"><code>{selected.code}</code></pre>
      </div>
      <p className="border-t [border-top-style:solid] border-t-border px-5 py-3.5 text-muted text-[12px] leading-[1.6] max-[37.5rem]:px-3.75">{selected.note}</p>
    </div>
  );
}
