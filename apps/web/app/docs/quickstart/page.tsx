import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { CodeBlock } from "@/features/docs/code-block";
import { publicationExample } from "@/lib/example";

export const metadata: Metadata = {
  title: "Quickstart",
  description:
    "Configure a receiver, publish an event, and inspect your first Cascadehook delivery.",
};
export default function QuickstartPage() {
  const command = publicationExample.replace(
    "https://YOUR_API_HOST",
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ||
      "https://YOUR_API_HOST",
  );
  return (
    <article className="docs-article">
      <PageHeader
        title="Send your first webhook"
        description="From a new project to a confirmed delivery."
      />
      <nav className="docs-contents" aria-label="On this page">
        <a href="#project">Create a project</a>
        <a href="#receiver">Prepare a receiver</a>
        <a href="#endpoint">Connect it</a>
        <a href="#publish">Publish</a>
        <a href="#delivery">Confirm delivery</a>
      </nav>
      <section id="project">
        <h2>1. Create an organization and project</h2>
        <p>
          <Link href="/sign-up" className="text-link">
            Create an account
          </Link>
          , name your organization, then create a project. Its Overview tracks
          the setup steps using current project data.
        </p>
        <Link href="/dashboard" className="text-link text-accent">
          Open your projects →
        </Link>
      </section>
      <section id="receiver">
        <h2>2. Prepare a receiver</h2>
        <p>
          Download the shared receiver and either the Node.js or Bun adapter.
          They validate signatures, answer the ownership challenge, and save
          ordinary events before acknowledging them. Start the receiver after
          obtaining its signing secret in the next step.
        </p>
        <Link href="/docs/receivers" className="text-link text-accent">
          Get the working receiver examples →
        </Link>
        <p>
          Expose <code>/webhooks</code> at a public HTTPS URL you control. The
          examples listen over HTTP locally; your host or reverse proxy handles
          TLS. Loopback/private addresses and redirects are rejected by
          Cascadehook.
        </p>
      </section>
      <section id="endpoint">
        <h2>3. Register, verify, and enable the endpoint</h2>
        <ol>
          <li>
            In Endpoints, register your receiver URL and subscribe to{" "}
            <code>invoice.paid</code>.
          </li>
          <li>
            Generate its signing secret and save the one-time value in your
            receiver environment as <code>CASCADEHOOK_SIGNING_SECRET</code>.
            Start the receiver with that secret, and restart it after changing
            it.
          </li>
          <li>
            Select <strong>Verify receiver</strong>. The receiver must return
            the signed challenge proof; an empty 200 response does not pass.
          </li>
          <li>Explicitly enable delivery after verification succeeds.</li>
        </ol>
        <p>
          The signing secret verifies incoming webhooks. It is separate from the
          project API key used to publish events.
        </p>
      </section>
      <section id="publish">
        <h2>4. Create an API key and publish</h2>
        <p>
          Create a project API key in API keys and save its one-time value.
          Replace <code>YOUR_PROJECT_API_KEY</code> below; use your API origin
          if the host is still a placeholder.
        </p>
        <CodeBlock title="Publish invoice.paid" code={command} />
        <p>
          A <code>202 Accepted</code> response means the event is saved and
          queued. It does not confirm delivery. Reuse the same idempotency key
          when retrying the same payload; change it when publishing a new event.
          Keys remain idempotent for 24 hours.
        </p>
        <p>
          Project Overview provides a command matched to your chosen
          endpoint&apos;s subscriptions. Development and Live key labels
          currently grant the same project scope.
        </p>
      </section>
      <section id="delivery">
        <h2>5. Confirm the delivery</h2>
        <p>
          Return to Overview or Deliveries. Wait for <strong>Succeeded</strong>,
          then open the delivery to inspect its attempts. The example receiver
          writes accepted ordinary events to <code>received-events.ndjson</code>
          .
        </p>
        <p>
          Delivery is at least once. Deduplicate downstream work by{" "}
          <code>Webhook-Id</code>; retries and manual replays preserve that
          identifier.
        </p>
      </section>
      <section>
        <h2>If a step fails</h2>
        <dl className="docs-troubleshooting">
          <div>
            <dt>Verification fails</dt>
            <dd>
              Check the public HTTPS URL, current signing secret, raw-body
              verification, and challenge proof. Wait 30 seconds before another
              verification attempt.
            </dd>
          </div>
          <div>
            <dt>No delivery appears</dt>
            <dd>
              Confirm that the endpoint was enabled when you published and that
              the event type exactly matches a subscription. Publish a new event
              key after fixing setup; repeating an accepted request does not fan
              it out again.
            </dd>
          </div>
          <div>
            <dt>A delivery fails</dt>
            <dd>
              Open its attempts for status, error, and retry details. Fix the
              receiver before replaying a completed delivery.
            </dd>
          </div>
        </dl>
      </section>
    </article>
  );
}
