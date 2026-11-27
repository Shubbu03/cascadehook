import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { DocsLink } from "@/components/docs-link";
import { supportEmail } from "@/lib/support";
import { DeliveryStreams } from "./delivery-streams";
import { FooterWordmark } from "./footer-wordmark";

const container = "w-[min(1320px,calc(100%-clamp(40px,6vw,96px)))] mx-auto";
const link = "inline-flex min-h-8 items-center gap-1.5 text-[14px] text-muted transition-colors duration-150 hover:text-foreground pointer-coarse:min-h-11";
const external = <ArrowUpRightIcon size={12} aria-hidden="true" />;

type Item = { label: string; href: string; docs?: boolean; external?: boolean };

const groups: { title: string; items: Item[] }[] = [
  {
    title: "Product",
    items: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Compare", href: "/compare" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    title: "Developers",
    items: [
      { label: "Docs", href: "/docs", docs: true },
      { label: "Quickstart", href: "/docs/quickstart", docs: true },
      { label: "API reference", href: "/docs/api", docs: true },
      { label: "Set up with an AI agent", href: "/docs/agents", docs: true },
      { label: "GitHub", href: "https://github.com/Shubbu03/cascadehook", external: true },
    ],
  },
  {
    title: "Free tools",
    items: [
      { label: "Webhook tester", href: "/tools/webhook-tester" },
      { label: "Signature verifier", href: "/tools/webhook-signature-verifier" },
      { label: "Stripe verifier", href: "/tools/stripe-webhook-signature-verifier" },
      { label: "GitHub verifier", href: "/tools/github-webhook-signature-verifier" },
      { label: "Shopify HMAC verifier", href: "/tools/shopify-webhook-hmac-verifier" },
      { label: "Slack verifier", href: "/tools/slack-request-signature-verifier" },
      { label: "Signature schemes compared", href: "/tools/webhook-signature-comparison" },
      { label: "All tools", href: "/tools" },
    ],
  },
  {
    title: "Company",
    items: [
      { label: "Support", href: "/support" },
      { label: "Email us", href: `mailto:${supportEmail}`, external: true },
      { label: "Refunds", href: "/refunds" },
    ],
  },
];

function FooterLink({ item }: { item: Item }): ReactNode {
  if (item.docs) return <DocsLink path={item.href} className={link}>{item.label}</DocsLink>;
  if (item.external) {
    const newTab = item.href.startsWith("http");
    return (
      <a href={item.href} className={link} {...(newTab && { target: "_blank", rel: "noopener noreferrer" })}>
        {item.label} {newTab && external}
      </a>
    );
  }
  return <Link href={item.href} className={link}>{item.label}</Link>;
}

export function SiteFooter() {
  return (
    <footer className="overflow-hidden border-t border-solid border-border">
      <div className={`${container} grid grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] gap-x-10 gap-y-12 pt-24 max-[68.75rem]:grid-cols-4 max-[53.125rem]:pt-18 max-[37.5rem]:grid-cols-2 max-[37.5rem]:gap-x-6 max-[37.5rem]:pt-14`}>
        <div className="min-w-0 max-[68.75rem]:col-span-4 max-[37.5rem]:col-span-2">
          <span className="block w-fit zoom-[1.35] max-[37.5rem]:zoom-[1.15]"><Brand href={null} /></span>
          <p className="mt-5 max-w-70 text-muted text-[14px] leading-[1.7]">Outbound webhooks, taken care of. Signed, retried, and on the record.</p>
        </div>
        {groups.map((group) => (
          <nav key={group.title} aria-label={group.title} className="min-w-0">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted/80 uppercase">{group.title}</p>
            <ul className="mt-4 mb-0 grid list-none gap-1 p-0">
              {group.items.map((item) => <li key={item.label}><FooterLink item={item} /></li>)}
            </ul>
          </nav>
        ))}
      </div>

      <div className="relative mt-20 max-[37.5rem]:mt-14">
        <div className="px-[clamp(12px,2vw,28px)]"><DeliveryStreams /></div>
        <FooterWordmark />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-background from-35% to-transparent pt-10">
          <div className={`${container} flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-5 font-mono text-[11px] text-muted`}>
            <span>© 2026 Cascadehook</span>
            <span className="pointer-events-auto flex items-center gap-2.5">
              <Link href="/terms" className="transition-colors hover:text-foreground">Terms</Link>
              <span aria-hidden="true">·</span>
              <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
