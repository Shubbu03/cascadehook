import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { CodeBlock } from "@/features/docs/code-block";
import { receiverSource } from "@/features/docs/receiver-source";

export const metadata: Metadata = {
  title: "Receiver examples",
  description:
    "Working Node.js and Bun webhook receivers with signature validation and ownership verification.",
};
export default async function ReceiversPage() {
  const [core, node, bun] = await Promise.all([
    receiverSource("receiver-core.mjs"),
    receiverSource("node-receiver.mjs"),
    receiverSource("bun-receiver.mjs"),
  ]);
  return (
    <article className="docs-article">
      <PageHeader
        title="Receiver examples"
        description="Node.js and Bun adapters share the same verified receiver."
      />
      <p>
        Save{" "}
        <a href="/examples/receiver-core.mjs" download>
          receiver-core.mjs
        </a>{" "}
        and one adapter in the same directory. Use Node.js 22+ or Bun 1.3+. No
        packages are required.
      </p>
      <div className="docs-runtime-grid">
        <section>
          <h2>Node.js</h2>
          <CodeBlock
            title="Start the Node receiver"
            code={
              "export CASCADEHOOK_SIGNING_SECRET='YOUR_ENDPOINT_SIGNING_SECRET'\nnode node-receiver.mjs"
            }
          />
          <a href="/examples/node-receiver.mjs" download className="text-link">
            Download Node adapter →
          </a>
        </section>
        <section>
          <h2>Bun</h2>
          <CodeBlock
            title="Start the Bun receiver"
            code={
              "export CASCADEHOOK_SIGNING_SECRET='YOUR_ENDPOINT_SIGNING_SECRET'\nbun bun-receiver.mjs"
            }
          />
          <a href="/examples/bun-receiver.mjs" download className="text-link">
            Download Bun adapter →
          </a>
        </section>
      </div>
      <section>
        <h2>Connect the receiver</h2>
        <p>
          It listens at <code>http://127.0.0.1:9000/webhooks</code>. Set{" "}
          <code>PORT</code> or <code>HOST</code> if your deployment needs
          another listener. Use a public HTTPS host or reverse proxy for the URL
          registered with Cascadehook; no experimental local HTTPS is needed.
        </p>
        <p>
          The handler enforces a 256 KiB body limit, a five-minute timestamp
          tolerance, and a constant-time HMAC comparison before parsing JSON.
          During signing-secret rotation, it accepts any supported signature
          that matches its configured key. Install the current secret before
          requesting a new ownership verification.
        </p>
        <Link
          href="/docs/quickstart#endpoint"
          className="text-link text-accent"
        >
          Continue the quickstart →
        </Link>
      </section>
      <section>
        <h2>Durable intake and duplicate handling</h2>
        <p>
          Ordinary events are appended to <code>received-events.ndjson</code>{" "}
          and synced before a 204 response. Set <code>RECEIPTS_FILE</code> to a
          writable path on persistent storage. Verification challenges return
          only the required proof and are not added to the inbox.
        </p>
        <p>
          This is a single-process reference inbox, not a business worker. Keep
          its payload file out of source control, rotate or drain it, and
          process records idempotently by <code>webhook_id</code>. Duplicate
          receipts are expected; a replay keeps the same ID. For multiple
          processes, replace the file with a transactional database or durable
          queue before acknowledging.
        </p>
      </section>
      <section>
        <h2>Source</h2>
        <p>The copied source and downloads below use the same files.</p>
        <details className="docs-source">
          <summary>Shared receiver: receiver-core.mjs</summary>
          <CodeBlock
            title="receiver-core.mjs"
            code={core}
            download="/examples/receiver-core.mjs"
          />
        </details>
        <details className="docs-source">
          <summary>Node.js adapter: node-receiver.mjs</summary>
          <CodeBlock
            title="node-receiver.mjs"
            code={node}
            download="/examples/node-receiver.mjs"
          />
        </details>
        <details className="docs-source">
          <summary>Bun adapter: bun-receiver.mjs</summary>
          <CodeBlock
            title="bun-receiver.mjs"
            code={bun}
            download="/examples/bun-receiver.mjs"
          />
        </details>
      </section>
    </article>
  );
}
