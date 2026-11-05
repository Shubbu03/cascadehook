import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DocsLink } from "@/components/docs-link";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata, siteName, siteURL } from "@/lib/site";
import { tools } from "./catalog";
import { CodeTabs, type Snippet } from "./code-tabs";
import { ReferenceTabs } from "./reference-tabs";
import { SignatureVerifier } from "./signature-verifier";
import type { ProviderId } from "./verifier/core";

export type VerifierContent = {
  provider: ProviderId;
  path: string;
  title: string;
  metaTitle: string;
  description: string;
  intro: ReactNode;
  failures: ReactNode;
  snippets: Snippet[];
  howItWorks: ReactNode;
  trademark?: { name: string; owner: string };
};

const prose = "max-w-185 [&_h3]:text-[15px] [&_h3]:font-medium [&_h3:not(:first-child)]:mt-5 [&_p]:mt-1.5 [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.8] [&_p:first-child]:mt-0 [&_ol]:mt-3 [&_ol]:pl-5.5 [&_ol]:[list-style:decimal] [&_ul]:mt-3 [&_ul]:pl-5.5 [&_ul]:[list-style:disc] [&_li]:mt-1.5 [&_li]:text-muted [&_li]:text-[14px] [&_li]:leading-[1.75] [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-foreground";
const textLink = "text-foreground underline underline-offset-[3px]";

export function verifierMetadata(content: VerifierContent): Metadata {
  return pageMetadata({ path: content.path, title: content.metaTitle, description: content.description });
}

export function VerifierPage({ content }: { content: VerifierContent }) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: content.metaTitle,
    url: siteURL + content.path,
    description: content.description,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@id": siteURL + "/#organization", name: siteName },
  };
  const related = tools.filter((tool) => tool.href !== content.path);

  return (
    <div>
      <JsonLd data={structuredData} />
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <div className="min-w-0">
          <p className="text-[13px] leading-[1.6]">
            <Link href="/tools" className="text-muted hover:text-foreground">Tools</Link>
            <span className="text-muted" aria-hidden="true"> / </span>
            <span className="text-accent">Free tool</span>
          </p>
          <h1 className="mt-2 text-[clamp(30px,3.6vw,42px)] font-medium leading-[1.15] tracking-[-.04em]">{content.title}</h1>
        </div>
        <p className="max-w-120 text-muted text-[14px] leading-[1.7]">{content.intro}</p>
      </header>

      <section aria-label="Verifier" className="mt-8">
        <SignatureVerifier provider={content.provider} />
      </section>

      <section aria-label="Reference" className="mt-14">
        <ReferenceTabs
          label="Reference"
          tabs={[
            { id: "failures", label: "Why verification fails", content: <div className={prose}>{content.failures}</div> },
            { id: "code", label: "Verification code", content: <CodeTabs snippets={content.snippets} /> },
            { id: "how", label: "How signatures work", content: <div className={prose}>{content.howItWorks}</div> },
          ]}
        />
      </section>

      <nav aria-label="More verifiers" className="mt-12">
        <h2 className="text-[13px] font-medium text-muted">More free verifiers</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {related.map((tool) => (
            <li key={tool.href}>
              <Link href={tool.href} className="inline-flex min-h-9 items-center rounded-full border border-solid border-border px-3.5 text-[13px] text-foreground transition-colors duration-150 hover:border-input-border hover:bg-surface-hover motion-reduce:transition-none">
                {tool.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="mt-10 text-muted text-[13px] leading-[1.7]">
        {content.trademark ? (
          <>
            Sending webhooks from your own product? {siteName} signs every delivery with Standard Webhooks, retries failures for up to 72 hours, and keeps every attempt for replay.
            {" "}<Link href="/login" className={textLink}>Create a project</Link> or try the <Link href="/tools/webhook-signature-verifier" className={textLink}>Standard Webhooks verifier</Link>.
          </>
        ) : (
          <>
            Sending webhooks yourself? {siteName} signs every delivery this way, retries failures for up to 72 hours, and keeps every attempt for replay.
            {" "}<Link href="/login" className={textLink}>Create a project</Link> or read the <DocsLink path="/docs/security/signatures" className={textLink}>signature docs</DocsLink>.
          </>
        )}
      </p>
      {content.trademark && (
        <p className="mt-3 text-muted text-[12px] leading-[1.6]">
          {content.trademark.name} is a trademark of {content.trademark.owner}. {siteName} isn&apos;t affiliated with or endorsed by {content.trademark.name}.
        </p>
      )}
    </div>
  );
}
