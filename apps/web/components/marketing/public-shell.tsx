import Link from "next/link";
import { MarketingHeader } from "./marketing-header";

export function PublicShell({ children }: { children: React.ReactNode; }) {
  return (
    <div className={"[--landing-header-height:96px] min-h-svh bg-background text-foreground flex flex-col max-[53.125rem]:[--landing-header-height:88px] max-[37.5rem]:[--landing-header-height:80px] motion-safe:[&_[data-motion=\"reveal\"][data-visible=\"true\"]]:animate-landing-content-reveal"}>
      <MarketingHeader />
      <main id="main-content" className="w-[min(1320px,calc(100%-clamp(40px,6vw,96px)))] flex-1 mx-auto py-[clamp(48px,8vw,100px)]">{children}</main>
      <footer className="w-[min(1320px,calc(100%-clamp(40px,6vw,96px)))] flex items-center justify-between flex-wrap border-t [border-top-style:solid] border-t-border text-muted text-[12px] mx-auto py-7.5 gap-6 [&_nav]:flex [&_nav]:flex-wrap [&_nav]:gap-4.5">
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
