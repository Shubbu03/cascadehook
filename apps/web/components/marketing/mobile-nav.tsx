"use client";

import { ListIcon } from "@phosphor-icons/react";
import { useRef } from "react";
import { DocsLink } from "@/components/docs-link";

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
        <DocsLink path="/docs" onClick={close}>
          Docs
        </DocsLink>
      </nav>
    </details>
  );
}
