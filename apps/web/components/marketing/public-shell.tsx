import Link from "next/link";
import { Brand } from "@/components/brand";
import { DocsLink } from "@/components/docs-link";
import { ThemeSwitcher } from "@/components/theme-switcher";

export function PublicShell({ children, showPricing = false }: { children: React.ReactNode; showPricing?: boolean }) {
  return (
    <div className="public-page">
      <header className="landing-header landing-container">
        <Brand href="/" />
        <nav className="public-nav" aria-label="Main navigation">
          {showPricing && <Link href="/pricing">Pricing</Link>}
          <DocsLink>Docs</DocsLink>
          <Link href="/support">Support</Link>
        </nav>
        <ThemeSwitcher />
        <Link className="landing-header-cta" href="/login">Get started</Link>
      </header>
      <main id="main-content" className="landing-container public-main">{children}</main>
      <footer className="public-footer landing-container">
        <Link href="/">Cascadehook</Link>
        <nav aria-label="Legal and support">
          <Link href="/support">Contact</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          {showPricing && <Link href="/refunds">Refunds &amp; cancellation</Link>}
        </nav>
      </footer>
    </div>
  );
}
