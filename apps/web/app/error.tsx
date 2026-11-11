"use client";

import { Button, buttonStyles } from "@/components/button";

import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { messageCard, pageContainer } from "@/components/styles";

export default function PageError({ reset }: { reset: () => void; }) {
  return (
    <div className="min-h-svh">
      <header data-ui="workspace-header" className="w-[min(1200px,calc(100%-80px))] flex items-center justify-between min-h-17 border-b border-b-border mx-auto gap-6 max-[65.625rem]:w-[calc(100%-56px)] max-[37.5rem]:w-[calc(100%-40px)] max-[37.5rem]:min-h-20 max-[37.5rem]:flex-wrap max-[37.5rem]:py-4.5">
        <Brand />
        <ThemeSwitcher />
      </header>
      <main id="main-content" className={pageContainer}>
        <div data-ui="empty-state" className={messageCard} role="alert">
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
