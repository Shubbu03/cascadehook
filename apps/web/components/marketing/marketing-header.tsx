import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { DocsLink } from "@/components/docs-link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { MobileNav } from "./mobile-nav";

export function MarketingHeader({ home = false }: { home?: boolean }) {
  const howItWorksHref = home ? "#how-it-works" : "/#how-it-works";

  return (
    <header className="landing-header landing-container">
      <Brand href={home ? null : "/"} />
      <nav className="landing-desktop-nav" aria-label="Main navigation">
        <a href={howItWorksHref}>How it works</a>
        <DocsLink path="/docs">Docs</DocsLink>
        <Link href="/support">Support</Link>
      </nav>
      <div className="landing-header-actions">
        <ThemeSwitcher />
        <Link href="/login" className="landing-header-cta">
          Get started <ArrowUpRightIcon size={16} aria-hidden="true" />
        </Link>
        <MobileNav howItWorksHref={howItWorksHref} />
      </div>
    </header>
  );
}
