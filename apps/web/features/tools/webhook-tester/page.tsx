import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { FaqList, faqStructuredData } from "@/components/marketing/faq-list";
import { breadcrumbList, pageMetadata } from "@/lib/site";
import type { WebhookTesterContent } from "../content/webhook-tester";
import { ReferenceTabs } from "../reference-tabs";
import { ProductCallout, prose, RelatedTools, ToolHeader, toolApplication } from "../tool-page-parts";
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
      faqStructuredData(content.faq),
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
              content: <FaqList items={content.faq} />,
            },
          ]}
        />
      </section>

      <ProductCallout />

      <RelatedTools current={content.path} />
    </div>
  );
}
