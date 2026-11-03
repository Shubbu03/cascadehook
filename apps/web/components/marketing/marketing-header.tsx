import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { DocsLink } from "@/components/docs-link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { MobileNav } from "./mobile-nav";

export function MarketingHeader({ home = false }: { home?: boolean; }) {
  const howItWorksHref = home ? "#how-it-works" : "/#how-it-works";

  return (
    <header data-ui="landing-header" className="w-[min(1320px,calc(100%-clamp(40px,6vw,96px)))] flex items-center min-h-(--landing-header-height) border-b [border-bottom-style:solid] border-b-border mx-auto gap-7 max-[68.75rem]:gap-5 max-[53.125rem]:justify-between max-[37.5rem]:gap-3">
      <Brand href={home ? null : "/"} />
      <nav className="flex items-center ml-auto gap-6 max-[68.75rem]:gap-4.5 max-[53.125rem]:hidden [&_a]:inline-flex [&_a]:items-center [&_a]:min-h-11 [&_a]:text-muted [&_a]:text-[13px] [&_a:hover]:text-foreground" aria-label="Main navigation">
        <a href={howItWorksHref}>How it works</a>
        <DocsLink path="/docs">Docs</DocsLink>
        <Link href="/support">Support</Link>
      </nav>
      <div className="flex items-center gap-5 max-[68.75rem]:gap-3 max-[53.125rem]:gap-2.5 max-[37.5rem]:gap-1">
        <ThemeSwitcher />
        <Link href="/login" className="inline-flex items-center justify-center min-h-10 rounded-[100px] text-[13px] font-medium leading-normal text-center whitespace-nowrap [transition:background-color_140ms,border-color_140ms] gap-3.5 py-2 px-4 border border-solid border-input-border max-[37.5rem]:hidden pointer-coarse:min-h-11 motion-reduce:transition-none motion-safe:[&_>_svg]:[transition:transform_180ms_ease-out] [&:hover]:bg-surface-hover [&:hover]:border-foreground motion-safe:[&:focus-visible_>_svg]:transform-[translate(2px,-2px)] motion-safe:[@media(hover:_hover)_and_(pointer:_fine)]:[&:hover_>_svg]:transform-[translate(2px,-2px)]">
          Get started <ArrowUpRightIcon size={16} aria-hidden="true" />
        </Link>
        <MobileNav howItWorksHref={howItWorksHref} />
      </div>
    </header>
  );
}
