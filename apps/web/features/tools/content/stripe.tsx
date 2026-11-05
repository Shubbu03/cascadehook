import type { Snippet } from "../code-tabs";
import type { VerifierContent } from "../verifier-page";

const snippets: Snippet[] = [
  {
    id: "node",
    label: "Node.js",
    note: "With Express, register the webhook route with express.raw({ type: \"application/json\" }) before app.use(express.json()). The stripe package does the same check in stripe.webhooks.constructEvent.",
    code: String.raw`import { createHmac, timingSafeEqual } from "node:crypto";

// rawBody must be the exact bytes received (a Buffer), not re-serialized JSON.
export function verifyStripeWebhook(rawBody, headers, secret) {
  let timestamp;
  const signatures = [];
  for (const item of (headers["stripe-signature"] ?? "").split(",")) {
    const separator = item.indexOf("=");
    const key = item.slice(0, separator);
    const value = item.slice(separator + 1);
    if (key === "t") timestamp = value;
    else if (key === "v1") signatures.push(Buffer.from(value, "hex"));
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  // The whole whsec_ string is the key: don't strip it or Base64-decode it.
  const expected = createHmac("sha256", secret)
    .update(timestamp + ".")
    .update(rawBody)
    .digest();

  return signatures.some(
    (signature) => signature.length === expected.length && timingSafeEqual(signature, expected),
  );
}`,
  },
  {
    id: "python",
    label: "Python",
    note: "Pass request.get_data() in Flask or request.body in Django, before reading the JSON. The stripe package does the same check in stripe.Webhook.construct_event.",
    code: String.raw`import hashlib
import hmac
import time


def verify_stripe_webhook(raw_body: bytes, headers, secret: str) -> bool:
    timestamp = ""
    signatures = []
    for item in headers.get("stripe-signature", "").split(","):
        key, _, value = item.partition("=")
        if key == "t":
            timestamp = value
        elif key == "v1":
            signatures.append(value)
    if not (timestamp.isascii() and timestamp.isdigit()) or not signatures:
        return False
    if abs(time.time() - int(timestamp)) > 300:
        return False

    # The whole whsec_ string is the key: don't strip it or Base64-decode it.
    signed = timestamp.encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, signature) for signature in signatures)`,
  },
  {
    id: "go",
    label: "Go",
    note: "Read the body with io.ReadAll (behind http.MaxBytesReader) and verify before json.Unmarshal. stripe-go does the same check in webhook.ConstructEvent.",
    code: String.raw`package webhooks

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// body must be the exact bytes read from the request, before any JSON decoding.
func VerifyStripe(body []byte, header http.Header, secret string) bool {
	var timestamp string
	var signatures [][]byte
	for _, item := range strings.Split(header.Get("Stripe-Signature"), ",") {
		key, value, _ := strings.Cut(item, "=")
		switch key {
		case "t":
			timestamp = value
		case "v1":
			if signature, err := hex.DecodeString(value); err == nil {
				signatures = append(signatures, signature)
			}
		}
	}
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || len(signatures) == 0 {
		return false
	}
	if age := time.Since(time.Unix(seconds, 0)); age > 5*time.Minute || age < -5*time.Minute {
		return false
	}

	// The whole whsec_ string is the key: don't strip it or Base64-decode it.
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "."))
	mac.Write(body)
	expected := mac.Sum(nil)
	for _, signature := range signatures {
		if hmac.Equal(signature, expected) {
			return true
		}
	}
	return false
}`,
  },
];

export const stripeContent: VerifierContent = {
  provider: "stripe",
  path: "/tools/stripe-webhook-signature-verifier",
  title: "Stripe webhook signature verifier",
  metaTitle: "Stripe Webhook Signature Verifier",
  description:
    "Free Stripe webhook signature checker. Paste the Stripe-Signature header, the endpoint's signing secret, and the raw body to see why verification fails. Runs in your browser.",
  intro: "Check a Stripe-Signature header against your endpoint's signing secret and see exactly why verification fails. Nothing you paste leaves your browser.",
  trademark: { name: "Stripe", owner: "Stripe, Inc." },
  failures: (
    <>
      <h3>&ldquo;No signatures found matching the expected signature for payload&rdquo;</h3>
      <p>
        Stripe&apos;s libraries raise this error for every mismatch, so on its own it doesn&apos;t say what&apos;s wrong. One of three inputs is: the raw body, the
        {" "}<code>Stripe-Signature</code> header, or the endpoint secret. Paste all three above to find out which.
      </p>
      <h3>The body was parsed before it was verified</h3>
      <p>
        The most common cause. If <code>express.json()</code> runs before your webhook route, the body is already an object, and serializing it again changes its bytes.
        Register the webhook route with <code>express.raw(&#123; type: &quot;application/json&quot; &#125;)</code> before <code>app.use(express.json())</code>.
        In a Next.js route handler, read <code>await request.text()</code>; in the Pages Router, turn off <code>bodyParser</code> and read the raw buffer.
        Behind API Gateway, pass the raw body through to your Lambda function.
      </p>
      <h3>The secret is from a different endpoint</h3>
      <p>
        Every endpoint has its own <code>whsec_</code> secret, and test-mode and live-mode endpoints never share one. <code>stripe listen</code> prints a secret of its own,
        separate from any Dashboard endpoint, so a secret that works locally fails in production, and the other way around.
      </p>
      <h3>The secret was changed on its way to the HMAC</h3>
      <p>
        Stripe uses the whole <code>whsec_…</code> string as text for the key. Stripping the prefix, Base64-decoding the rest (which is how Standard Webhooks secrets work),
        or loading it from an <code>.env</code> file with a trailing newline or quotes all change the key.
      </p>
      <h3>Only part of the header is checked</h3>
      <p>
        The header holds a timestamp and one or more signatures: <code>t=…,v1=…,v1=…</code>. Split it on commas, sign with the <code>t</code> value, and accept the request
        if any <code>v1</code> entry matches. Ignore <code>v0</code>; it&apos;s a placeholder on test events.
      </p>
      <h3>The timestamp is outside the tolerance</h3>
      <p>
        Stripe&apos;s libraries reject requests signed more than five minutes ago. Every retry is signed again with a fresh timestamp, so this usually means a request was
        replayed by hand or the server&apos;s clock has drifted. Keep it synced with NTP.
      </p>
    </>
  ),
  snippets,
  howItWorks: (
    <>
      <p>Stripe signs each delivery with the endpoint&apos;s secret and sends one header, <code>Stripe-Signature</code>, with comma-separated parts:</p>
      <ul>
        <li><code>t</code>: when the attempt was signed, in Unix seconds. Each retry gets a new one.</li>
        <li><code>v1</code>: the HMAC-SHA256 signature as hex. There&apos;s one per active secret, so two appear for up to 24 hours after you roll a secret.</li>
        <li><code>v0</code>: a placeholder signature on test events. Ignore it.</li>
      </ul>
      <p className="mt-4!">To verify a request:</p>
      <ol>
        <li>Split the header on commas and each part on its first <code>=</code>, keeping <code>t</code> and every <code>v1</code>.</li>
        <li>Build the message <code>t + &quot;.&quot; + raw body</code>.</li>
        <li>Compute HMAC-SHA256 of it with the whole <code>whsec_</code> secret as the key, and hex-encode the result.</li>
        <li>Compare it in constant time with each <code>v1</code> value. Any match is valid.</li>
        <li>Reject timestamps more than five minutes from your clock.</li>
      </ol>
      <p className="mt-4!">
        Stripe&apos;s libraries do all of this in <code>stripe.webhooks.constructEvent</code> (Node), <code>stripe.Webhook.construct_event</code> (Python), and
        {" "}<code>webhook.ConstructEvent</code> (Go). When they reject a request, this page shows which input is wrong.
      </p>
    </>
  ),
};
