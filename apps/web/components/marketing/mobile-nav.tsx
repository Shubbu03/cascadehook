"use client";

import { ListIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRef } from "react";
import { docsHref } from "@/lib/docs";

export function MobileNav() {
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
        <a href="#how-it-works" onClick={close}>
          How it works
        </a>
        <a href={docsHref("/docs/quickstart")} onClick={close}>
          Quickstart
        </a>
        <Link href="/sign-in" onClick={close}>
          Sign in
        </Link>
      </nav>
    </details>
  );
}
