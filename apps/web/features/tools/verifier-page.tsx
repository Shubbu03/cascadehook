import type { Metadata } from "next";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbList, pageMetadata, siteName } from "@/lib/site";
import { CodeTabs, type Snippet } from "./code-tabs";
import { ReferenceTabs } from "./reference-tabs";
import { SignatureVerifier } from "./signature-verifier";
import { ProductCallout, prose, RelatedTools, ToolHeader, toolApplication } from "./tool-page-parts";
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

export function verifierMetadata(content: VerifierContent): Metadata {
  return pageMetadata({ path: content.path, title: content.metaTitle, description: content.description, markdown: true });
}

export function VerifierPage({ content }: { content: VerifierContent }) {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      toolApplication({ name: content.metaTitle, path: content.path, description: content.description }),
      breadcrumbList([{ name: "Tools", path: "/tools" }, { name: content.title, path: content.path }]),
    ],
  };

  return (
    <div>
      <JsonLd data={structuredData} />
      <ToolHeader title={content.title} intro={content.intro} />

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

      <ProductCallout standardWebhooks={!content.trademark} />

      <RelatedTools current={content.path} />

      {content.trademark && (
        <p className="mt-10 text-muted text-[12px] leading-[1.6]">
          {content.trademark.name} is a trademark of {content.trademark.owner.replace(/\.$/, "")}. {siteName} isn&apos;t affiliated with or endorsed by {content.trademark.name}.
        </p>
      )}
    </div>
  );
}
