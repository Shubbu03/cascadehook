import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default function NotFound() {
  return (
    <div className="workspace-page">
      <header className="workspace-header page-width">
        <Brand />
        <ThemeSwitcher />
      </header>
      <main id="main-content" className="page-width workspace-main">
        <div className="empty-state">
          <span className="eyebrow">404 · PAGE NOT FOUND</span>
          <h1>This page took a wrong turn.</h1>
          <p>
            The link may have changed. Let&apos;s get you back to familiar
            ground.
          </p>
          <Link href="/" className="button button-primary">
            Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
