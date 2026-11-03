"use client";

import { ListIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRef } from "react";
import { DocsLink } from "@/components/docs-link";

export function MobileNav({ howItWorksHref }: { howItWorksHref: string; }) {
  const details = useRef<HTMLDetailsElement>(null);
  function close() {
    if (details.current) details.current.open = false;
  }
  return (
    <details
      ref={details}
      className="hidden relative [&_summary]:flex [&_summary]:items-center [&_summary]:justify-center [&_summary]:rounded-[7px] [&_summary]:list-none [&_summary]:size-11 [&_nav]:absolute [&_nav]:right-0 [&_nav]:top-13 [&_nav]:z-20 [&_nav]:grid [&_nav]:w-50 [&_nav]:rounded-[10px] [&_nav]:bg-surface [&_nav]:shadow-floating [&_nav]:p-2 [&_nav]:border [&_nav]:border-solid [&_nav]:border-border [&_nav_a]:block [&_nav_a]:text-[14px] [&_nav_a]:rounded-[5px] [&_nav_a]:p-3 [&_summary::-webkit-details-marker]:hidden [&[open]_summary]:bg-surface-hover [&_nav_a:hover]:bg-surface-hover max-[53.125rem]:block"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          close();
          details.current?.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label="Navigation menu">
        <ListIcon size={23} aria-hidden="true" />
      </summary>
      <nav aria-label="Mobile navigation">
        <a href={howItWorksHref} onClick={close}>
          How it works
        </a>
        <DocsLink path="/docs" onClick={close}>
          Docs
        </DocsLink>
        <Link href="/support" onClick={close}>Support</Link>
        <Link href="/login" onClick={close}>Get started</Link>
      </nav>
    </details>
  );
}
