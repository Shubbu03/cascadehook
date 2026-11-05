import type { Snippet } from "../code-tabs";
import type { VerifierContent } from "../verifier-page";

const snippets: Snippet[] = [
  {
    id: "node",
    label: "Node.js",
    note: "With Express, use express.raw({ type: \"*/*\" }) on this route so rawBody is the original Buffer, form-encoded or JSON. Bolt for JavaScript runs this check itself.",
    code: String.raw`import { createHmac, timingSafeEqual } from "node:crypto";

// rawBody must be the exact bytes received (a Buffer), before any form or JSON parsing.
export function verifySlackRequest(rawBody, headers, signingSecret) {
  const timestamp = headers["x-slack-request-timestamp"] ?? "";
  const header = headers["x-slack-signature"] ?? "";
  if (!/^\d+$/.test(timestamp) || !header.startsWith("v0=")) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected = createHmac("sha256", signingSecret)
    .update("v0:" + timestamp + ":")
    .update(rawBody)
    .digest();
  const signature = Buffer.from(header.slice("v0=".length), "hex");
  return signature.length === expected.length && timingSafeEqual(signature, expected);
}`,
  },
  {
    id: "python",
    label: "Python",
    note: "Pass request.get_data() in Flask or request.body in Django, before reading request.form or the payload. slack_sdk's SignatureVerifier does the same check.",
    code: String.raw`import hashlib
import hmac
import time


def verify_slack_request(raw_body: bytes, headers, signing_secret: str) -> bool:
    timestamp = headers.get("x-slack-request-timestamp", "")
    signature = headers.get("x-slack-signature", "")
    if not (timestamp.isascii() and timestamp.isdigit()):
        return False
    if abs(time.time() - int(timestamp)) > 300:
        return False

    base = b"v0:" + timestamp.encode() + b":" + raw_body
    expected = "v0=" + hmac.new(signing_secret.encode(), base, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)`,
  },
  {
    id: "go",
    label: "Go",
    note: "Read the body with io.ReadAll (behind http.MaxBytesReader) and verify before r.ParseForm or json.Unmarshal. slack-go's NewSecretsVerifier does the same check.",
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

// body must be the exact bytes read from the request, before any parsing.
func VerifySlack(body []byte, header http.Header, signingSecret string) bool {
	timestamp := header.Get("X-Slack-Request-Timestamp")
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false
	}
	if age := time.Since(time.Unix(seconds, 0)); age > 5*time.Minute || age < -5*time.Minute {
		return false
	}
	value, ok := strings.CutPrefix(header.Get("X-Slack-Signature"), "v0=")
	if !ok {
		return false
	}
	signature, err := hex.DecodeString(value)
	if err != nil {
		return false
	}

	mac := hmac.New(sha256.New, []byte(signingSecret))
	mac.Write([]byte("v0:" + timestamp + ":"))
	mac.Write(body)
	return hmac.Equal(signature, mac.Sum(nil))
}`,
  },
];

export const slackContent: VerifierContent = {
  provider: "slack",
  path: "/tools/slack-request-signature-verifier",
  title: "Slack request signature verifier",
  metaTitle: "Slack Request Signature Verifier",
  description:
    "Free Slack request signature checker. Paste X-Slack-Signature, the request timestamp, your signing secret, and the raw body to see why verification fails. Runs in your browser.",
  intro: "Check an X-Slack-Signature header for slash commands, interactivity, and Events API requests, and see why verification fails. Nothing you paste leaves your browser.",
  trademark: { name: "Slack", owner: "Slack Technologies, LLC" },
  failures: (
    <>
      <h3>The body was decoded or parsed first</h3>
      <p>
        Slash commands and interactive components arrive as <code>application/x-www-form-urlencoded</code>, and Slack signs those raw bytes with their percent-escapes.
        Once a framework parses the form into fields, the signed bytes are gone. In Flask, call <code>request.get_data()</code> before reading <code>request.form</code>;
        in Express, use <code>express.raw(&#123; type: &quot;*/*&quot; &#125;)</code> on the route.
      </p>
      <h3>The interactivity payload was taken out of the form</h3>
      <p>
        Interactive requests send <code>payload=</code> with the JSON URL-encoded inside it. Verify the whole form body first, then read and parse the
        {" "}<code>payload</code> field.
      </p>
      <h3>The base string is wrong</h3>
      <p>
        Slack signs <code>v0:timestamp:body</code>, joined with colons, using the <code>X-Slack-Request-Timestamp</code> value exactly as sent.
        Leaving out <code>v0:</code>, joining with periods, or using your own clock&apos;s time all produce a different signature.
      </p>
      <h3>The wrong secret</h3>
      <p>
        Use the Signing Secret from your app&apos;s Basic Information page. The Verification Token on the same page is a different, deprecated value, and bot or user tokens
        (<code>xoxb-</code>, <code>xoxp-</code>) aren&apos;t signing secrets at all. Regenerating the secret stops the old one from working.
      </p>
      <h3>The request is too old</h3>
      <p>
        Reject requests whose timestamp is more than five minutes from your clock, to block replays. A signature that verifies here but fails in your app may just be a request
        captured earlier. Keep your clock synced with NTP.
      </p>
      <h3>Something already read the body</h3>
      <p>
        Bolt checks the signature for you when you give it the signing secret. If you add your own check after Bolt or another middleware has consumed the body,
        it hashes something other than the raw request and fails even for genuine requests.
      </p>
    </>
  ),
  snippets,
  howItWorks: (
    <>
      <p>Slack signs each request with your app&apos;s signing secret and sends two headers:</p>
      <ul>
        <li><code>X-Slack-Request-Timestamp</code>: when the request was sent, in Unix seconds.</li>
        <li><code>X-Slack-Signature</code>: <code>v0=</code> followed by the HMAC-SHA256 of the base string, as hex.</li>
      </ul>
      <p className="mt-4!">To verify a request:</p>
      <ol>
        <li>Reject it if the timestamp is more than five minutes from your clock.</li>
        <li>Build the base string <code>&quot;v0:&quot; + timestamp + &quot;:&quot; + raw body</code>.</li>
        <li>Compute HMAC-SHA256 of it, keyed with the signing secret&apos;s UTF-8 bytes, and hex-encode the result.</li>
        <li>Add the <code>v0=</code> prefix and compare it in constant time with <code>X-Slack-Signature</code>.</li>
      </ol>
      <p className="mt-4!">
        This works the same for slash commands, interactivity, and the Events API; only the body&apos;s format differs. Slack&apos;s Bolt frameworks do the check for you
        when you configure the signing secret.
      </p>
    </>
  ),
};
