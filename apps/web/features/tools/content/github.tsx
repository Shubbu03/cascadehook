import type { Snippet } from "../code-tabs";
import type { VerifierContent } from "../verifier-page";

const snippets: Snippet[] = [
  {
    id: "node",
    label: "Node.js",
    note: "With Express, use express.raw({ type: \"application/json\" }) on the webhook route so rawBody is the original Buffer. @octokit/webhooks does the same check in verify().",
    code: String.raw`import { createHmac, timingSafeEqual } from "node:crypto";

// rawBody must be the exact bytes received (a Buffer), not re-serialized JSON.
export function verifyGitHubWebhook(rawBody, headers, secret) {
  const header = headers["x-hub-signature-256"] ?? "";
  if (!header.startsWith("sha256=")) return false;

  const signature = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return signature.length === expected.length && timingSafeEqual(signature, expected);
}`,
  },
  {
    id: "python",
    label: "Python",
    note: "Pass request.get_data() in Flask or request.body in Django, before reading the JSON.",
    code: String.raw`import hashlib
import hmac


def verify_github_webhook(raw_body: bytes, headers, secret: str) -> bool:
    header = headers.get("x-hub-signature-256", "")
    if not header.startswith("sha256="):
        return False

    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header)`,
  },
  {
    id: "go",
    label: "Go",
    note: "Read the body with io.ReadAll (behind http.MaxBytesReader) and verify before json.Unmarshal. go-github does the same check in github.ValidatePayload.",
    code: String.raw`package webhooks

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
)

// body must be the exact bytes read from the request, before any JSON decoding.
func VerifyGitHub(body []byte, header http.Header, secret string) bool {
	value, ok := strings.CutPrefix(header.Get("X-Hub-Signature-256"), "sha256=")
	if !ok {
		return false
	}
	signature, err := hex.DecodeString(value)
	if err != nil {
		return false
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hmac.Equal(signature, mac.Sum(nil))
}`,
  },
];

export const githubContent: VerifierContent = {
  provider: "github",
  path: "/tools/github-webhook-signature-verifier",
  title: "GitHub webhook signature verifier",
  metaTitle: "GitHub Webhook Signature Verifier",
  description:
    "Free GitHub webhook signature checker for X-Hub-Signature-256. Paste the webhook secret, the header, and the raw payload to see if it's valid and why it fails. Runs in your browser.",
  intro: "Check an X-Hub-Signature-256 header against your webhook's secret and see why verification fails. Nothing you paste leaves your browser.",
  trademark: { name: "GitHub", owner: "GitHub, Inc." },
  failures: (
    <>
      <h3>The body was parsed before it was verified</h3>
      <p>
        GitHub signs the exact payload bytes. Middleware such as <code>express.json()</code> hands you an object, and serializing it again rarely reproduces those bytes.
        Read the raw body, verify it, then parse it. Payloads can contain Unicode, so handle the bytes as UTF-8.
      </p>
      <h3>The webhook sends form data</h3>
      <p>
        With the content type set to <code>application/x-www-form-urlencoded</code>, GitHub signs the form body: <code>payload=</code> with the JSON URL-encoded inside it.
        Verifying the JSON you read out of the <code>payload</code> field fails. Verify the raw form body, or set the webhook&apos;s content type to <code>application/json</code>.
      </p>
      <h3>The wrong secret</h3>
      <p>
        Repository, organization, and GitHub App webhooks each have their own secret. If a webhook has no secret at all, GitHub sends no signature header.
      </p>
      <h3>The legacy header was used</h3>
      <p>
        <code>X-Hub-Signature</code> carries an HMAC-SHA1 signature and exists only for compatibility; <code>X-Hub-Signature-256</code> uses HMAC-SHA256.
        Computing one algorithm and comparing against the other header always fails.
      </p>
      <h3>The prefix was dropped on one side</h3>
      <p>
        The header is <code>sha256=</code> followed by the hex digest. Either compare the whole header with <code>&quot;sha256=&quot; + digest</code>, or strip the prefix
        and compare the digests. Mixing the two never matches.
      </p>
      <h3>Something between GitHub and your code changed the body</h3>
      <p>
        A proxy, load balancer, or API gateway that re-encodes the body changes the bytes your code sees. Verify where the original request arrives, or make sure
        anything in front of it passes the body through untouched.
      </p>
    </>
  ),
  snippets,
  howItWorks: (
    <>
      <p>GitHub signs each delivery with the webhook&apos;s secret and sends:</p>
      <ul>
        <li><code>X-Hub-Signature-256</code>: <code>sha256=</code> followed by the HMAC-SHA256 of the payload, as hex.</li>
        <li><code>X-Hub-Signature</code>: the same with HMAC-SHA1, for older integrations.</li>
        <li><code>X-GitHub-Delivery</code>: a unique ID for the delivery, handy for matching a request to Recent Deliveries in the webhook&apos;s settings.</li>
      </ul>
      <p className="mt-4!">To verify a request:</p>
      <ol>
        <li>Compute HMAC-SHA256 of the raw request body, keyed with the secret&apos;s UTF-8 bytes.</li>
        <li>Hex-encode the result and add the <code>sha256=</code> prefix.</li>
        <li>Compare it in constant time with <code>X-Hub-Signature-256</code>.</li>
      </ol>
      <p className="mt-4!">
        The signature doesn&apos;t include a timestamp, so it doesn&apos;t expire. GitHub publishes a test case to check your code against: the secret
        {" "}<code>It&apos;s a Secret to Everybody</code> and the payload <code>Hello, World!</code> give
        {" "}<code>sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17</code>.
      </p>
    </>
  ),
};
