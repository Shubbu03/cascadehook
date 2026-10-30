import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="docs-page">
      <header className="docs-header">
        <Brand />
        <nav aria-label="Documentation">
          <Link href="/docs/quickstart">Quickstart</Link>
          <Link href="/docs/receivers">Receivers</Link>
          <Link href="/docs/agents">AI setup</Link>
        </nav>
        <div className="docs-header-actions">
          <ThemeSwitcher />
          <Link
            href="/dashboard"
            className="button button-small button-secondary"
          >
            Open app
          </Link>
        </div>
      </header>
      <main id="main-content" className="docs-main">
        {children}
      </main>
    </div>
  );
}
