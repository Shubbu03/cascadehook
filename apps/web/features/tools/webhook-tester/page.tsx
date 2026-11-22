import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbList, pageMetadata, siteName } from "@/lib/site";
import type { WebhookTesterContent } from "../content/webhook-tester";
import { ReferenceTabs } from "../reference-tabs";
import { prose, RelatedTools, textLink, ToolHeader, toolApplication } from "../tool-page-parts";
import { WebhookTester } from "./tester";

export function webhookTesterMetadata(content: WebhookTesterContent): Metadata {
  return pageMetadata({ path: content.path, title: content.metaTitle, description: content.description, markdown: true });
}

export function WebhookTesterPage({ content }: { content: WebhookTesterContent }) {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      toolApplication({ name: content.metaTitle, path: content.path, description: content.description }),
      breadcrumbList([{ name: "Tools", path: "/tools" }, { name: content.title, path: content.path }]),
      {
        "@type": "FAQPage",
        mainEntity: content.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };

  return (
    <div>
      <JsonLd data={structuredData} />
      <ToolHeader title={content.title} intro={content.intro} />

      <section aria-label="Webhook tester" className="mt-8">
        <WebhookTester />
      </section>

      <section aria-label="Reference" className="mt-14">
        <ReferenceTabs
          label="Reference"
          tabs={[
            { id: "guide", label: "Guide", content: <div className={prose}>{content.guide}</div> },
            { id: "signatures", label: "Signature checks", content: <div className={prose}>{content.signatures}</div> },
            { id: "limits", label: "Limits and privacy", content: <div className={prose}>{content.limits}</div> },
            {
              id: "faq",
              label: "FAQ",
              content: (
                <div className={prose}>
                  {content.faq.map((item) => (
                    <div key={item.question}>
                      <h3>{item.question}</h3>
                      <p>{item.answer}</p>
                    </div>
                  ))}
                </div>
              ),
            },
          ]}
        />
      </section>

      <RelatedTools current={content.path} />

      <p className="mt-10 text-muted text-[13px] leading-[1.7]">
        Sending webhooks from your own product? {siteName} signs every delivery with Standard Webhooks, retries failures for up to 72 hours, and keeps every attempt for replay.
        {" "}<Link href="/login" className={textLink}>Create a project</Link> or compare <Link href="/tools/webhook-signature-comparison" className={textLink}>signature schemes</Link>.
      </p>
    </div>
  );
}
