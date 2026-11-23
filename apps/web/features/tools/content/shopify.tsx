import type { Snippet } from "../code-tabs";
import type { VerifierContent } from "../verifier-page";

const snippets: Snippet[] = [
  {
    id: "node",
    label: "Node.js",
    note: "With Express, use express.raw({ type: \"application/json\" }) on the webhook route so rawBody is the original Buffer. In apps built from Shopify's templates, authenticate.webhook(request) does this check.",
    code: String.raw`import { createHmac, timingSafeEqual } from "node:crypto";

// rawBody must be the exact bytes received (a Buffer), not re-serialized JSON.
export function verifyShopifyWebhook(rawBody, headers, clientSecret) {
  const signature = Buffer.from(headers["x-shopify-hmac-sha256"] ?? "", "base64");
  const expected = createHmac("sha256", clientSecret).update(rawBody).digest();
  return signature.length === expected.length && timingSafeEqual(signature, expected);
}`,
  },
  {
    id: "python",
    label: "Python",
    note: "Pass request.get_data() in Flask or request.body in Django, before reading the JSON.",
    code: String.raw`import base64
import hashlib
import hmac


def verify_shopify_webhook(raw_body: bytes, headers, client_secret: str) -> bool:
    header = headers.get("x-shopify-hmac-sha256", "")
    digest = hmac.new(client_secret.encode(), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode(), header)`,
  },
  {
    id: "go",
    label: "Go",
    note: "Read the body with io.ReadAll (behind http.MaxBytesReader) and verify before json.Unmarshal.",
    code: String.raw`package webhooks

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
)

// body must be the exact bytes read from the request, before any JSON decoding.
func VerifyShopify(body []byte, header http.Header, clientSecret string) bool {
	signature, err := base64.StdEncoding.DecodeString(header.Get("X-Shopify-Hmac-Sha256"))
	if err != nil {
		return false
	}

	mac := hmac.New(sha256.New, []byte(clientSecret))
	mac.Write(body)
	return hmac.Equal(signature, mac.Sum(nil))
}`,
  },
];

export const shopifyContent: VerifierContent = {
  provider: "shopify",
  path: "/tools/shopify-webhook-hmac-verifier",
  title: "Shopify webhook HMAC verifier",
  metaTitle: "Shopify Webhook HMAC Verifier",
  description:
    "Free Shopify webhook HMAC checker. Paste X-Shopify-Hmac-Sha256, your app's client secret, and the raw body to see why verification fails. Runs in your browser.",
  intro: "Check an X-Shopify-Hmac-Sha256 header against your app's client secret and see why the HMAC doesn't match. Nothing you paste leaves your browser.",
  trademark: { name: "Shopify", owner: "Shopify Inc." },
  failures: (
    <>
      <h3>The body was parsed before it was verified</h3>
      <p>
        Shopify signs the raw body. If <code>express.json()</code> or another parser runs first, the body you hash is a re-serialized copy.
        Use <code>express.raw(&#123; type: &quot;application/json&quot; &#125;)</code> on the webhook route, or read the raw body before your framework parses it.
        Apps built from Shopify&apos;s templates can call <code>authenticate.webhook(request)</code>, which verifies the HMAC for you.
      </p>
      <h3>The wrong secret</h3>
      <p>
        Webhooks an app subscribes to are signed with that app&apos;s client secret, shown next to its client ID in the app&apos;s settings. It isn&apos;t the API key,
        an Admin API access token (<code>shpat_…</code>), or the secret of another app.
      </p>
      <h3>The webhook was created in the store admin</h3>
      <p>
        Webhooks created under Settings → Notifications in the Shopify admin aren&apos;t tied to an app. Developers report that they&apos;re signed with the key shown on that
        page rather than an app&apos;s client secret.
      </p>
      <h3>The secret was just rotated</h3>
      <p>
        After you rotate the client secret, Shopify can take up to an hour to start signing with the new one. Accept both secrets until the change has taken effect.
      </p>
      <h3>The HMAC is compared as hex</h3>
      <p>
        The header is Base64, not hex. Encode your digest as Base64 before comparing, or decode the header to bytes and compare those with
        {" "}<code>crypto.timingSafeEqual</code>.
      </p>
    </>
  ),
  snippets,
  howItWorks: (
    <>
      <p>Shopify signs each HTTPS delivery and sends:</p>
      <ul>
        <li><code>X-Shopify-Hmac-Sha256</code>: the Base64-encoded HMAC-SHA256 of the raw body.</li>
        <li><code>X-Shopify-Webhook-Id</code>: a unique ID for the delivery. Use it to skip duplicates.</li>
        <li><code>X-Shopify-Topic</code> and <code>X-Shopify-Shop-Domain</code>: which event fired, and for which store.</li>
      </ul>
      <p className="mt-4!">To verify a request:</p>
      <ol>
        <li>Compute HMAC-SHA256 of the raw request body, keyed with the client secret&apos;s UTF-8 bytes.</li>
        <li>Base64-encode the result.</li>
        <li>Compare it in constant time with <code>X-Shopify-Hmac-Sha256</code>.</li>
      </ol>
      <p className="mt-4!">
        The signature doesn&apos;t include a timestamp, so it doesn&apos;t expire. Deliveries to Google Cloud Pub/Sub or Amazon EventBridge aren&apos;t signed this way.
      </p>
    </>
  ),
};
