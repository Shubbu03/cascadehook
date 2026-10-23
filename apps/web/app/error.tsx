"use client";

import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default function PageError({ reset }: { reset: () => void }) {
  return (
    <div className="workspace-page">
      <header className="workspace-header page-width">
        <Brand />
        <ThemeSwitcher />
      </header>
      <main id="main-content" className="page-width workspace-main">
        <div className="empty-state" role="alert">
          <h1>We couldn&apos;t load this page.</h1>
          <p>
            Please try again. If the problem continues, return home and sign in
            again.
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={reset}
            >
              Try again
            </button>
            <Link href="/" className="button button-secondary">
              Back to home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
