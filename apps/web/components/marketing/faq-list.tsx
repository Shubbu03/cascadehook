import { ArrowRightIcon, CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export type FaqItem = { question: string; answer: string; link?: { href: string; label: string } };

export function faqStructuredData(items: FaqItem[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

// Native <details> works without JavaScript and keeps closed answers in the HTML for search engines.
export function FaqList({ items, className = "" }: { items: FaqItem[]; className?: string }) {
  return (
    <ul className={"max-w-185 overflow-hidden rounded-[14px] border border-solid border-border " + className}>
      {items.map((item) => (
        <li key={item.question} className="border-t border-solid border-border first:border-t-0">
          <details className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 transition-colors duration-150 hover:bg-surface-hover focus-visible:-outline-offset-2 motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
              <h3 className="text-[15px] font-medium leading-normal">{item.question}</h3>
              <CaretDownIcon size={16} aria-hidden="true" className="shrink-0 text-muted motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-180" />
            </summary>
            <div className="px-5 pb-4.5 pt-0.5">
              <p className="text-muted text-[14px] leading-[1.75]">{item.answer}</p>
              {item.link && (
                <Link href={item.link.href} className="mt-2 inline-flex min-h-11 items-center gap-1.75 text-accent text-[13px] hover:underline hover:underline-offset-4">
                  {item.link.label} <ArrowRightIcon size={14} aria-hidden="true" />
                </Link>
              )}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
