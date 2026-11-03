"use client";

import { Button, buttonStyles } from "@/components/button";

import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default function PageError({ reset }: { reset: () => void; }) {
  return (
    <div className="min-h-svh">
      <header data-ui="workspace-header" className="w-[min(1200px,calc(100%-80px))] flex items-center justify-between min-h-17 border-b [border-bottom-style:solid] border-b-border mx-auto gap-6 max-[65.625rem]:w-[calc(100%-56px)] max-[37.5rem]:w-[calc(100%-40px)] max-[37.5rem]:min-h-20 max-[37.5rem]:flex-wrap max-[37.5rem]:py-4.5">
        <Brand />
        <ThemeSwitcher />
      </header>
      <main id="main-content" className="w-[min(1200px,calc(100%-80px))] pt-8 pb-16 mx-auto max-[65.625rem]:w-[calc(100%-56px)] max-[37.5rem]:w-[calc(100%-40px)] max-[37.5rem]:pt-6 max-[37.5rem]:pb-12">
        <div data-ui="empty-state" className="grid justify-items-start rounded-xl bg-surface gap-3.5 p-7 border border-solid border-border [&_h3]:text-[20px] [&_h3]:tracking-[-0.02em] [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.7]" role="alert">
          <h1>We couldn&apos;t load this page.</h1>
          <p>
            Please try again. If the problem continues, return home and sign in
            again.
          </p>
          <div data-ui="form-actions" className="flex items-center flex-wrap gap-2.5">
            <Button
              type="button"
              data-ui="button"
              onClick={reset}
            >
              Try again
            </Button>
            <Link href="/" data-ui="button" className={buttonStyles({ variant: "secondary" })}>
              Back to home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
