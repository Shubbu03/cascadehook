import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";

const proofExample = [
  'import { createHmac } from "node:crypto";',
  "",
  "// Inside your handler, after validating the request signature.",
  "// signingSecret comes from your server environment.",
  'const key = Buffer.from(signingSecret.slice("whsec_".length), "base64");',
  'const proof = createHmac("sha256", key)',
  '  .update("cascadehook.verify.v1." + webhookId + "." + event.data.challenge)',
  '  .digest("base64");',
  "",
  "return Response.json({ proof });",
].join("\n");

const challengeExample = [
  "{",
  '  "type": "endpoint.verification",',
  '  "data": {',
  '    "endpoint_id": "your-endpoint-uuid",',
  '    "challenge": "random-challenge-from-cascadehook"',
  "  }",
  "}",
].join("\n");

export function ReceiverGuide() {
  return (
    <article className="receiver-guide">
      <PageHeader title="Receiver guide" />
      <p className="notice">
        Verification makes a real request to your receiver. A generic webhook
        inbox that only returns 200 will not pass the ownership challenge.
      </p>
      <section className="endpoint-section">
        <h3>1. Install the signing secret</h3>
        <p>
          Generate a secret on the endpoint settings page and store it in your
          receiver&apos;s server environment. Remove the <code>whsec_</code>{" "}
          prefix and decode the rest as standard Base64 to obtain the 32-byte
          HMAC key.
        </p>
        <p>
          Keep this credential on the server. Do not put it in browser code,
          logs, or source control.
        </p>
      </section>
      <section className="endpoint-section">
        <h3>2. Validate the request signature</h3>
        <p>
          Read the exact raw request bytes before parsing JSON. Do not
          reserialize the body before checking its signature.
        </p>
        <dl className="protocol-fields">
          <div>
            <dt>Webhook-Id</dt>
            <dd>
              The delivery identifier, or a unique identifier for a verification
              request.
            </dd>
          </div>
          <div>
            <dt>Webhook-Timestamp</dt>
            <dd>
              Unix time in seconds. Enforce a bounded age and future-clock
              tolerance, for example five minutes.
            </dd>
          </div>
          <div>
            <dt>Webhook-Signature</dt>
            <dd>
              One or more space-separated <code>v1,</code> signatures, using
              standard Base64.
            </dd>
          </div>
        </dl>
        <div className="protocol-recipe">
          <span className="field-label">Signed message</span>
          <code>
            Webhook-Id + &quot;.&quot; + Webhook-Timestamp + &quot;.&quot; + raw
            body bytes
          </code>
        </div>
        <p>
          Calculate HMAC-SHA256 with the decoded key, encode it as Base64, and
          compare it to a <code>v1</code> signature using a constant-time
          comparison. Require a match before processing any event. Bound request
          size and reject missing or malformed headers.
        </p>
        <p>
          During rotation, the signature header can contain both current and
          previous signatures. Accept any matching supported signature with a
          configured, valid credential during the five-minute transition.
        </p>
      </section>
      <section className="endpoint-section">
        <h3>3. Answer the ownership challenge</h3>
        <p>
          After signature validation, an <code>endpoint.verification</code>{" "}
          event requires a proof response. Use the current signing secret for
          this proof.
        </p>
        <pre className="guide-code">
          <code>{challengeExample}</code>
        </pre>
        <div className="code-example">
          <div className="code-example-header">
            <span>Proof calculation in your validated Node/Bun handler</span>
            <CopyButton
              value={proofExample}
              label="Copy snippet"
              successMessage="Proof snippet copied. Use it after request signature validation."
            />
          </div>
          <pre>
            <code>{proofExample}</code>
          </pre>
        </div>
        <p className="field-help">
          The snippet calculates the challenge proof; it does not replace
          signature validation. Respond with a 2xx status and exactly a JSON
          object containing <code>proof</code>.
        </p>
        <p>
          The proof message is <code>cascadehook.verify.v1.</code>, followed by
          the request&apos;s <code>Webhook-Id</code>, a dot, and{" "}
          <code>data.challenge</code>. The challenge must come from the verified
          request, not a generated value.
        </p>
      </section>
      <section className="endpoint-section">
        <h3>4. Verify, then enable delivery</h3>
        <p>
          Return to the endpoint settings and select &quot;Verify
          receiver&quot;. Once verification succeeds, explicitly enable
          delivery. Verification alone does not activate an endpoint.
        </p>
        <p>
          Attempts are limited to once every 30 seconds. Your receiver must be
          publicly reachable over HTTPS, complete the challenge promptly, and
          avoid redirects.
        </p>
      </section>
      <section className="endpoint-section">
        <h3>5. Accept ordinary events reliably</h3>
        <p>
          Validate signatures for ordinary events too. Use{" "}
          <code>Webhook-Id</code> for deduplication and durably accept work
          before returning a 2xx response. Delivery is at least once, so
          repeated attempts are expected.
        </p>
        <p>
          Manual replay preserves the delivery identifier. Account for that
          behavior when deciding which completed work your receiver should skip
          or repeat.
        </p>
      </section>
    </article>
  );
}
