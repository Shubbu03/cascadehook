import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
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
              content: <FaqList items={content.faq} />,
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

// Native <details> works without JavaScript and keeps closed answers in the HTML for search engines.
function FaqList({ items }: { items: WebhookTesterContent["faq"] }) {
  return (
    <ul className="max-w-185 overflow-hidden rounded-[14px] border border-solid border-border">
      {items.map((item) => (
        <li key={item.question} className="border-t border-solid border-border first:border-t-0">
          <details className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 transition-colors duration-150 hover:bg-surface-hover focus-visible:-outline-offset-2 motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
              <h3 className="text-[15px] font-medium leading-normal">{item.question}</h3>
              <CaretDownIcon size={16} aria-hidden="true" className="shrink-0 text-muted motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-180" />
            </summary>
            <p className="px-5 pb-4.5 pt-0.5 text-muted text-[14px] leading-[1.75]">{item.answer}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}
