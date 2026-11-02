"use client";

import { ListIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRef } from "react";
import { DocsLink } from "@/components/docs-link";

export function MobileNav({ howItWorksHref }: { howItWorksHref: string }) {
  const details = useRef<HTMLDetailsElement>(null);
  function close() {
    if (details.current) details.current.open = false;
  }
  return (
    <details
      ref={details}
      className="mobile-nav"
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
