import Link from "next/link";
import { MarketingHeader } from "./marketing-header";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-page public-page">
      <MarketingHeader />
      <main id="main-content" className="landing-container public-main">{children}</main>
      <footer className="public-footer landing-container">
        <Link href="/">Cascadehook</Link>
        <nav aria-label="Legal and support">
          <Link href="/support">Contact</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  );
}
