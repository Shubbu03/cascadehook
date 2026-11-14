import type { Metadata } from "next";
import Link from "next/link";
import { FullSearchTrigger } from "fumadocs-ui/layouts/shared/slots/search-trigger";
import { siteURL } from "@/lib/site";
import { source } from "@/lib/source";

export const metadata: Metadata = {
  title: "Page not found",
  description: "This documentation page doesn't exist. Search the Cascadehook docs or start from a popular guide.",
};

const popular = [
  ["quickstart"],
  ["receivers"],
  ["security", "signatures"],
  ["concepts", "deliveries"],
  ["api"],
  ["troubleshooting"],
];

export default function NotFound() {
  // Titles and descriptions come from the pages themselves, so they can't drift.
  const pages = popular.flatMap((slug) => source.getPage(slug) ?? []);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-fd-border">
        <div className="mx-auto flex min-h-16 w-[min(100%-48px,960px)] items-center justify-between gap-6">
          <Link href="/docs" className="brand" aria-label="Cascadehook docs home">
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
            <span>cascadehook<span className="brand-period">.</span></span>
            <span className="docs-brand-label">docs</span>
          </Link>
          {/* The main site is a separate Worker, so link to it like the docs layout does. */}
          <a href={siteURL} className="text-sm text-fd-muted-foreground hover:text-fd-foreground">cascadehook.com</a>
        </div>
      </header>
      <main id="nd-page" className="mx-auto w-[min(100%-48px,960px)] flex-1 py-[clamp(48px,8vw,96px)]">
        <p className="docs-eyebrow">404 / Page not found</p>
        <h1 className="max-w-[16ch] text-[clamp(36px,5vw,56px)] font-medium leading-[1.08] tracking-[-0.045em] text-balance">
          This page isn&apos;t in the <span className="text-fd-primary">docs.</span>
        </h1>
        <p className="mt-5 max-w-[60ch] text-[16px] leading-[1.8] text-fd-muted-foreground">
          It may have moved in a docs update, or the link has a typo. Search the docs, or start from one of the pages below.
        </p>
        <FullSearchTrigger className="mt-8 w-full max-w-md" />
        <h2 className="mt-14 text-[13px] font-medium text-fd-muted-foreground">Popular pages</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          {pages.map((page) => (
            <li key={page.url}>
              <Link
                href={page.url}
                className="group flex h-full flex-col rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:border-fd-primary/40 hover:bg-fd-accent motion-reduce:transition-none"
              >
                <span className="flex items-center justify-between gap-3 font-medium">
                  {page.data.title}
                  <span aria-hidden="true" className="text-fd-primary motion-safe:transition-transform group-hover:translate-x-0.5">→</span>
                </span>
                {page.type === "docs" && page.data.description && (
                  <span className="mt-1.5 text-sm leading-[1.7] text-fd-muted-foreground">{page.data.description}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-sm text-fd-muted-foreground">
          Looking for the free signature verifiers? They&apos;re at <a href={siteURL + "/tools"} className="text-fd-primary underline underline-offset-4">cascadehook.com/tools</a>.
        </p>
      </main>
    </div>
  );
}
