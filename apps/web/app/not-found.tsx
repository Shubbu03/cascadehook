
import { buttonStyles } from "@/components/button";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { messageCard, pageContainer } from "@/components/styles";

export default function NotFound() {
  return (
    <div className="min-h-svh">
      <header data-ui="workspace-header" className="w-[min(1200px,calc(100%-80px))] flex items-center justify-between min-h-17 border-b border-b-border mx-auto gap-6 max-[65.625rem]:w-[calc(100%-56px)] max-[37.5rem]:w-[calc(100%-40px)] max-[37.5rem]:min-h-20 max-[37.5rem]:flex-wrap max-[37.5rem]:py-4.5">
        <Brand />
        <ThemeSwitcher />
      </header>
      <main id="main-content" className={pageContainer}>
        <div data-ui="empty-state" className={messageCard}>
          <span className="font-medium text-[11px] leading-normal font-mono tracking-[0.02em] text-muted">404 · Page not found</span>
          <h1>This page took a wrong turn.</h1>
          <p>
            The link may have changed. Let&apos;s get you back to familiar
            ground.
          </p>
          <Link href="/" data-ui="button" className={buttonStyles()}>
            Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
