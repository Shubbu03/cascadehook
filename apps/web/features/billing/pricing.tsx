import { CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { JsonLd } from "@/components/json-ld";
import { FaqList, faqStructuredData } from "@/components/marketing/faq-list";
import { deliveryLimits } from "@/features/marketing/limits";
import { PlanPicker } from "./plan-picker";
import { pricingFaq } from "./pricing-content";

const included = [
  "Standard Webhooks signing",
  `${deliveryLimits.attempts} attempts over up to ${deliveryLimits.windowHours} hours`,
  "Replay and full attempt history",
  `${deliveryLimits.payloadKiB} KiB event payloads`,
  "Verified endpoints, public IPs only",
  "Email support",
];

export function Pricing() {
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", ...faqStructuredData(pricingFaq) }} />
      <PlanPicker />

      <section aria-labelledby="included-heading" className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-3 rounded-2xl border border-solid border-border px-8 py-5 max-[37.5rem]:px-6">
        <h2 id="included-heading" className="text-[13px] font-medium">Every plan includes</h2>
        <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-muted text-[13px]">
          {included.map((item) => (
            <li key={item} className="inline-flex items-center gap-2">
              <CheckIcon size={13} weight="bold" className="text-success" aria-hidden="true" />{item}
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-4 text-[12px]/[1.8] text-muted">
        Prices are in USD; applicable taxes are shown at checkout. Choose an organization in the dashboard, then open Billing to subscribe.
      </p>

      <section aria-labelledby="pricing-questions" className="mt-24 max-[37.5rem]:mt-16">
        <h2 id="pricing-questions" className="text-[clamp(26px,3vw,34px)] font-normal leading-[1.2] tracking-[-0.04em]">Billing questions</h2>
        <FaqList items={pricingFaq} className="mt-8" />
      </section>
    </>
  );
}
