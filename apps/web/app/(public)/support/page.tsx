import type { Metadata } from "next";
import { DocsLink } from "@/components/docs-link";
import { supportEmail } from "@/lib/support";

export const metadata: Metadata = { title: "Support" };

export default function Page() {
  return (
    <article data-ui="public-prose" className="max-w-185 leading-[1.85] mx-auto [&_h1]:mb-6.5 [&_h1]:text-[clamp(36px,5vw,56px)] [&_h1]:font-medium [&_h1]:leading-[1.12] [&_h1]:tracking-[-.045em] [&_h2]:mt-8 [&_h2]:text-[21px] [&_h2]:leading-[1.4] [&_h2]:tracking-[-.02em] [&_p]:mt-4 [&_p]:text-muted [&_p]:text-[14px] [&_ul]:mt-4 [&_ul]:text-muted [&_ul]:text-[14px] [&_ul]:pl-5.5 [&_ul]:[list-style:disc] [&_a]:underline [&_a]:underline-offset-[3px]">
      <p data-ui="landing-eyebrow" className="text-accent text-[13px] leading-[1.6]">Support</p>
      <h1>How can we help?</h1>
      <p>Questions about setup, your account, or a delivery?</p>
      <a className="inline-block mt-5 mb-2 text-foreground text-[clamp(19px,3vw,28px)] wrap-anywhere" href={"mailto:" + supportEmail}>{supportEmail}</a>
      <p>Include your organization or project ID and the event or delivery ID when relevant. Leave API keys, signing secrets, passwords, and sensitive payloads out of your message.</p>
      <h2>Integration help</h2>
      <p>The <DocsLink path="/docs/quickstart">quickstart</DocsLink> walks through your first delivery. For an unsuccessful attempt, start with the <DocsLink path="/docs/troubleshooting">troubleshooting guide</DocsLink>.</p>
      <h2>What to expect</h2>
      <p>Support is provided by an independent developer. We do not currently offer 24/7 support or a guaranteed response time.</p>
    </article>
  );
}
