import { ArrowRightIcon, SealCheckIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { tools } from "@/features/tools/catalog";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  path: "/tools",
  title: "Free Webhook Tools",
  description: "Free tools for building and debugging webhooks, including a Standard Webhooks signature verifier that runs entirely in your browser.",
});

export default function Page() {
  return (
    <div>
      <header className="max-w-185">
        <p data-ui="landing-eyebrow" className="text-accent text-[13px] leading-[1.6]">Free tools</p>
        <h1 className="mt-2 text-[clamp(30px,3.6vw,42px)] font-medium leading-[1.15] tracking-[-.04em]">Webhook tools</h1>
        <p className="mt-3 text-muted text-[15px] leading-[1.8]">Small, free utilities for debugging webhooks. No sign-up, and nothing you paste leaves your browser.</p>
      </header>
      <ul className="mt-8 grid grid-cols-3 gap-5 max-[68.75rem]:grid-cols-2 max-[53.125rem]:grid-cols-1">
        {tools.map((tool) => (
          <li key={tool.href}>
            <Link
              href={tool.href}
              className="group flex h-full flex-col rounded-[14px] border border-solid border-border bg-surface p-6 transition-colors duration-150 hover:border-input-border hover:bg-surface-hover focus-visible:border-accent max-[37.5rem]:p-5 motion-reduce:transition-none"
            >
              <span className="flex size-11 items-center justify-center rounded-[10px] bg-accent-subtle text-accent">
                <SealCheckIcon size={24} aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-[19px] font-medium leading-[1.35] tracking-[-.015em]">{tool.title}</h2>
              <p className="mt-2 text-muted text-[14px] leading-[1.75]">{tool.description}</p>
              <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Tags">
                {tool.tags.map((tag) => (
                  <li key={tag} className="rounded-full border border-solid border-border px-2.5 py-0.5 text-muted text-[11px] leading-[1.6]">{tag}</li>
                ))}
              </ul>
              <span className="mt-auto inline-flex items-center gap-2 pt-6 text-[13px] font-medium text-accent">
                Open tool
                <ArrowRightIcon size={15} aria-hidden="true" className="motion-safe:transition-transform motion-safe:duration-180 group-hover:translate-x-0.75 group-focus-visible:translate-x-0.75" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
