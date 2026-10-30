import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { CodeBlock } from "@/features/docs/code-block";

export const metadata: Metadata = {
  title: "Set up with your AI agent",
  description: "Connect your application to Cascadehook with your existing coding agent, project context, and a verifiable test delivery.",
};

export default function AgentsPage() {
  return (
    <article className="docs-article">
      <PageHeader title="Set up with your AI agent" description="Bring your coding agent. Keep control of your project." />
      <nav className="docs-contents" aria-label="On this page">
        <a href="#prepare">Prepare your project</a>
        <a href="#connect">Connect your agent</a>
        <a href="#confirm">Confirm delivery</a>
        <a href="/docs/agents.md">Markdown guide</a>
        <a href="/openapi.json">OpenAPI schema</a>
      </nav>
      <section id="prepare">
        <h2>1. Create your account and project</h2>
        <p>
          Sign up, create an organization, and create a project yourself. Then
          open the project’s Overview and select <strong>Set up with AI</strong>.
          The setup panel gives you a prompt for that project with the API
          address and documentation links.
        </p>
        <Link href="/dashboard" className="text-link">Open your projects →</Link>
      </section>
      <section id="connect">
        <h2>2. Give your agent access</h2>
        <p>
          As an organization owner or admin, create a project API key from the
          API keys page. Save its one-time value as <code>CASCADEHOOK_API_KEY</code>{" "}
          in your application’s local environment or secret manager. Keep the
          value out of chat, source control, and client-side code. Let your agent
          load it without printing it.
        </p>
        <CodeBlock title="Local environment file — replace the placeholder" code="CASCADEHOOK_API_KEY=YOUR_PROJECT_API_KEY" />
        <p>
          Keys grant project-wide access, including endpoint and API key
          management. Development and Live labels currently have the same
          permissions; they do not create isolated environments. Share a key
          only with an agent you trust, and choose an expiry appropriate for
          your integration.
        </p>
        <p>
          Open your application’s repository with your coding agent and paste
          the project setup prompt. It contains project context and links, with
          no credentials. Your agent checks that the key belongs to the selected
          project before making changes, inspects your framework, and asks
          which business event and public HTTPS receiver you want to use.
        </p>
        <p>
          Your agent can add server-side publishing and receiver code, register
          an endpoint, configure its signing secret, verify ownership, and send
          a test event through the existing API. A receiver signing secret is
          separate from the project API key. Deployment access and a public URL
          may require your help.
        </p>
      </section>
      <section id="confirm">
        <h2>3. Check the actual delivery</h2>
        <p>
          Ask your agent for the event ID, delivery ID, and observed delivery
          state. Open that delivery in your project to confirm it
          <strong> succeeded</strong>. A <code>202 Accepted</code> response only
          confirms that an event was saved. A succeeded delivery confirms the
          receiver acknowledged it, not that downstream business work finished.
        </p>
        <p>
          The prompt tells your agent to reuse existing resources, protect
          credentials, and request approval before replacing secrets, modifying
          an existing receiver configuration, replaying deliveries, or deploying
          to production. These instructions guide the agent; the project API
          key’s permissions are still enforced by the existing API.
        </p>
      </section>
      <section>
        <h2>References for your agent</h2>
        <p>
          The <a href="/docs/agents.md">Markdown integration guide</a> covers
          the workflow, exact requests, signature verification, and common
          failures. The <a href="/openapi.json">OpenAPI schema</a> describes
          project API operations and their request and response shapes. Both
          references are public and contain no project-specific data.
        </p>
        <Link href="/docs/receivers" className="text-link">Working receiver examples →</Link>
      </section>
    </article>
  );
}
