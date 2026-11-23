import { ArrowRightIcon, ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { DocsLink } from "@/components/docs-link";
import { PublicShell } from "@/components/marketing/public-shell";
import { RequestedPath } from "./requested-path";

const destinations = [
  { title: "Send your first webhook", description: "Go from a new project to a confirmed delivery.", docs: "/docs/quickstart" },
  { title: "Webhook tools", description: "Free signature verifiers for Stripe, GitHub, Shopify, Slack, and more.", href: "/tools" },
  { title: "Signature schemes compared", description: "Headers, signing, and retry policies side by side.", href: "/tools/webhook-signature-comparison" },
  { title: "Support", description: "Ask about setup, your account, or a failed delivery.", href: "/support" },
] as const;

const card = "group flex h-full flex-col rounded-[14px] border border-solid border-border bg-surface p-5.5 transition-colors duration-150 hover:border-input-border hover:bg-surface-hover focus-visible:border-accent motion-reduce:transition-none";

export function NotFoundPage() {
  return (
    <PublicShell>
      <section aria-labelledby="not-found-heading" className="grid grid-cols-[1.05fr_1fr] items-center gap-14 py-[clamp(24px,5vw,72px)] max-[68.75rem]:gap-10 max-[53.125rem]:grid-cols-[minmax(0,1fr)] max-[53.125rem]:gap-9">
        <div className="min-w-0 max-w-140">
          <p className="text-accent font-mono text-[12px] leading-[1.6] tracking-[0.02em]">404 · Page not found</p>
          <h1 id="not-found-heading" className="mt-5 text-[clamp(40px,5.4vw,72px)] font-normal leading-[1.06] tracking-tighter text-balance">
            Nothing is listening <span className="text-accent">at this address.</span>
          </h1>
          <p className="mt-6 max-w-120 text-muted text-[16px] leading-[1.85] max-[37.5rem]:text-[15px]">
            The link may be out of date, or the URL has a typo. Like any 404 your receiver returns, this one won&apos;t be retried, so pick a new destination.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center gap-4 rounded-full border border-solid border-transparent bg-foreground px-5.25 py-3 text-sm font-medium text-background transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--foreground)_84%,var(--background))] motion-reduce:transition-none motion-safe:[&_svg]:transition-transform motion-safe:[&:hover_svg]:translate-x-0.75"
            >
              Back to home <ArrowRightIcon size={18} aria-hidden="true" />
            </Link>
            <DocsLink path="/docs" className="inline-flex min-h-11 items-center gap-2 text-[14px] hover:underline hover:underline-offset-[5px]">
              Read the docs <ArrowUpRightIcon size={15} aria-hidden="true" />
            </DocsLink>
          </div>
        </div>

        <figure className="min-w-0 rounded-2xl border border-solid border-border bg-surface p-6.5 max-[53.125rem]:w-full max-[53.125rem]:max-w-145 max-[37.5rem]:rounded-xl max-[37.5rem]:px-4 max-[37.5rem]:py-4.5">
          <figcaption className="flex flex-wrap items-center justify-between gap-3 pb-5.5 text-muted text-[11px]">
            <code className="min-w-0 font-mono text-[11px] text-foreground wrap-anywhere">
              GET <RequestedPath />
            </code>
            <span>Delivery log</span>
          </figcaption>
          <ol aria-label="Request attempts" className="m-0 list-none p-0 text-[12px] text-muted [&_li]:grid [&_li]:min-h-13.5 [&_li]:grid-cols-[7px_auto_minmax(0,1fr)_auto] [&_li]:items-center [&_li]:gap-3 [&_li]:border-t [&_li]:border-dashed [&_li]:border-t-border">
            <li>
              <span className="size-1.75 rounded-full bg-danger motion-safe:animate-pulse" aria-hidden="true" />
              <span>Attempt 1</span>
              <code className="font-mono text-[11px] text-danger">404 Not Found</code>
              <span className="font-mono text-[11px]">terminal</span>
            </li>
            <li>
              <span className="size-1.75 rounded-full bg-input-border" aria-hidden="true" />
              <span>Retry</span>
              <code className="font-mono text-[11px]">Not scheduled</code>
              <span className="font-mono text-[11px]">—</span>
            </li>
          </ol>
          <div className="border-t border-solid border-t-border pt-5.75 max-[37.5rem]:pt-4.5">
            <p className="text-[17px] leading-normal tracking-tight max-[37.5rem]:text-[16px]">Delivery ended on attempt 1.</p>
            <span className="mt-1.25 block text-muted text-[11px]">408, 429, and 5xx responses are retried. A 404 is final.</span>
          </div>
        </figure>
      </section>

      <nav aria-labelledby="destinations-heading" className="mt-[clamp(32px,5vw,64px)]">
        <h2 id="destinations-heading" className="text-[13px] font-medium text-muted">Popular destinations</h2>
        <ul className="mt-3 grid grid-cols-4 gap-4 max-[68.75rem]:grid-cols-2 max-[37.5rem]:grid-cols-1">
          {destinations.map((destination) => {
            const body = (
              <>
                <span className="text-[16px] font-medium leading-[1.4] tracking-[-0.01em]">{destination.title}</span>
                <span className="mt-1.5 text-muted text-[13px] leading-[1.7]">{destination.description}</span>
                <span className="mt-auto pt-4 text-accent" aria-hidden="true">
                  <ArrowRightIcon size={16} className="motion-safe:transition-transform group-hover:translate-x-0.75 group-focus-visible:translate-x-0.75" />
                </span>
              </>
            );
            return (
              <li key={destination.title}>
                {"docs" in destination ? (
                  <DocsLink path={destination.docs} className={card}>{body}</DocsLink>
                ) : (
                  <Link href={destination.href} className={card}>{body}</Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </PublicShell>
  );
}
