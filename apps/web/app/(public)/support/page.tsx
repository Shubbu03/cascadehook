import type { Metadata } from "next";
import { DocsLink } from "@/components/docs-link";
import { supportEmail } from "@/lib/support";

export const metadata: Metadata = { title: "Support" };

export default function Page() {
  return (
    <article className="public-prose">
      <p className="landing-eyebrow">Support</p>
      <h1>How can we help?</h1>
      <p>Questions about setup, your account, or a delivery?</p>
      <a className="support-address" href={"mailto:" + supportEmail}>{supportEmail}</a>
      <p>Include your organization or project ID and the event or delivery ID when relevant. Leave API keys, signing secrets, passwords, and sensitive payloads out of your message.</p>
      <h2>Integration help</h2>
      <p>The <DocsLink path="/docs/quickstart">quickstart</DocsLink> walks through your first delivery. For an unsuccessful attempt, start with the <DocsLink path="/docs/troubleshooting">troubleshooting guide</DocsLink>.</p>
      <h2>What to expect</h2>
      <p>Support is provided by an independent developer. We do not currently offer 24/7 support or a guaranteed response time.</p>
    </article>
  );
}
