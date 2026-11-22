import Link from "next/link";
import type { ReactNode } from "react";
import { siteName, siteURL } from "@/lib/site";
import { tools } from "./catalog";

export const prose = "max-w-185 [&_h3]:text-[15px] [&_h3]:font-medium [&_h3:not(:first-child)]:mt-5 [&_p]:mt-1.5 [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.8] [&_p:first-child]:mt-0 [&_ol]:mt-3 [&_ol]:pl-5.5 [&_ol]:[list-style:decimal] [&_ul]:mt-3 [&_ul]:pl-5.5 [&_ul]:[list-style:disc] [&_li]:mt-1.5 [&_li]:text-muted [&_li]:text-[14px] [&_li]:leading-[1.75] [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-foreground";
export const textLink = "text-foreground underline underline-offset-[3px]";

export function toolApplication({ name, path, description }: { name: string; path: string; description: string }) {
  return {
    "@type": "WebApplication",
    name,
    url: siteURL + path,
    description,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@id": siteURL + "/#organization", name: siteName },
  };
}

export function ToolHeader({ title, intro }: { title: string; intro: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="text-[13px] leading-[1.6]">
          <Link href="/tools" className="text-muted underline decoration-input-border underline-offset-[3px] hover:text-foreground hover:decoration-current">Tools</Link>
          <span className="text-muted" aria-hidden="true"> / </span>
          <span className="text-accent">Free tool</span>
        </nav>
        <h1 className="mt-2 text-[clamp(30px,3.6vw,42px)] font-medium leading-[1.15] tracking-[-.04em]">{title}</h1>
      </div>
      <p className="max-w-120 text-muted text-[14px] leading-[1.7]">{intro}</p>
    </header>
  );
}

export function RelatedTools({ current }: { current: string }) {
  const related = tools.filter((tool) => tool.href !== current);
  return (
    <nav aria-label="More tools" className="mt-12">
      <h2 className="text-[13px] font-medium text-muted">More free tools</h2>
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
  );
}
