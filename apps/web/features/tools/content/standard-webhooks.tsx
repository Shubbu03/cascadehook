import { siteName } from "@/lib/site";
import type { Snippet } from "../code-tabs";
import type { VerifierContent } from "../verifier-page";

export const snippets: Snippet[] = [
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
];

export const standardWebhooksContent: VerifierContent = {
  provider: "standard-webhooks",
  path: "/tools/webhook-signature-verifier",
  title: "Webhook signature verifier",
  metaTitle: "Webhook Signature Verifier",
  description:
    "Free webhook signature verifier for Standard Webhooks (webhook-id, webhook-timestamp, webhook-signature). Paste a request to see if its HMAC-SHA256 signature is valid and why it fails. Runs entirely in your browser.",
  intro: (
    <>
      Check a <a className="underline underline-offset-[3px] hover:text-foreground" href="https://www.standardwebhooks.com/" target="_blank" rel="noopener noreferrer">Standard Webhooks</a> signature and see why it fails. Works with {siteName} and any sender that follows the spec.
    </>
  ),
  failures: (
    <>
      <h3>The body was parsed before it was verified</h3>
      <p>
        The most common cause. Middleware such as <code>express.json()</code> turns the body into an object, and serializing it again changes key order, spacing, or number formatting.
        Verify the exact raw bytes first, then parse.
      </p>
      <h3>The secret is used as text</h3>
      <p>Passing the <code>whsec_…</code> string straight to your HMAC function uses its characters as the key. Strip the prefix and Base64-decode it first.</p>
      <h3>The wrong secret</h3>
      <p>Each endpoint has its own secret. After a rotation the old one stops working once the grace period ends, so make sure your receiver loads the new one.</p>
      <h3>The header is compared as a whole</h3>
      <p>The header can hold more than one signature. Split it on spaces and accept the request if any <code>v1</code> entry matches.</p>
      <h3>The timestamp is out of range</h3>
      <p>Clock drift, or testing with a request captured earlier, fails the tolerance check even when the signature is correct. Keep your clock synced with NTP.</p>
    </>
  ),
  snippets,
  howItWorks: (
    <>
      <p>The sender signs every request with a secret shared with your endpoint and sends three headers:</p>
      <ul>
        <li><code>webhook-id</code>: a unique message ID. Retries keep it, so use it to skip duplicates.</li>
        <li><code>webhook-timestamp</code>: when the attempt was signed, in Unix seconds.</li>
        <li><code>webhook-signature</code>: one or more space-separated <code>v1,&lt;base64&gt;</code> signatures. There are two while the sender rotates its secret.</li>
      </ul>
      <p className="mt-4!">To verify a request:</p>
      <ol>
        <li>Remove the <code>whsec_</code> prefix and Base64-decode the rest. The decoded bytes are the HMAC key.</li>
        <li>Build the message <code>webhook-id + &quot;.&quot; + webhook-timestamp + &quot;.&quot; + raw body</code>.</li>
        <li>Compute HMAC-SHA256 of it and Base64-encode the result.</li>
        <li>Compare it in constant time with each <code>v1,</code> entry. Any match is valid.</li>
        <li>Reject timestamps more than five minutes from your clock.</li>
      </ol>
    </>
  ),
};
