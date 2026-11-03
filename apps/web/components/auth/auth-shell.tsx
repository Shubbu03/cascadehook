import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { FormSkeleton } from "@/features/workspace/skeletons";
import { isAuthConfigured } from "@/lib/server/auth";
import { AuthBrand } from "./auth-brand";

export function AuthShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const brand = isAuthConfigured() ? <AuthBrand /> : <Brand href="/" />;

  return (
    <div className="grid grid-cols-[minmax(300px,2fr)_minmax(0,3fr)] min-h-svh max-[53.125rem]:grid-cols-[1fr]">
      <aside className="flex flex-col items-start border-r [border-right-style:solid] border-r-border py-11 px-[clamp(32px,4vw,68px)] [&_h2]:text-[clamp(42px,4.7vw,65px)] [&_h2]:tracking-[-0.055em] [&_h2]:leading-[1.08] [&_h2_span]:text-accent max-[65.625rem]:px-8 max-[53.125rem]:hidden">
        {brand}
        <div className="my-auto py-16 [&_p]:[max-width:320px] [&_p]:mt-5 [&_p]:text-[16px] [&_p]:leading-[1.65] [&_p]:text-muted">
          <h2>
            Welcome.
            <br />
            <span>Let’s build.</span>
          </h2>
          <p>
            Sign in or create an account to manage your webhook deliveries.
          </p>
        </div>
      </aside>
      <div className="flex flex-col min-w-0 bg-surface max-[53.125rem]:min-h-svh max-[53.125rem]:bg-background">
        <header data-ui="auth-topbar" className="flex items-center justify-between min-h-22 gap-4 py-5.5 px-9 max-[53.125rem]:min-h-21 max-[53.125rem]:py-5 max-[53.125rem]:px-7 max-[37.5rem]:min-h-20 max-[37.5rem]:py-4.5 max-[37.5rem]:px-5">
          <div data-ui="auth-mobile-brand" className="hidden max-[53.125rem]:flex max-[53.125rem]:items-center">
            {brand}
          </div>
          <nav aria-label="Page navigation">
            <Link href="/" className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 min-h-11 text-muted text-[12px] whitespace-nowrap [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px]">
              <ArrowLeftIcon size={16} aria-hidden="true" />
              Back to home
            </Link>
          </nav>
        </header>
        <main
          id="main-content"
          className="grid content-center flex-1 w-[min(400px,calc(100%-40px))] m-auto py-12 max-[53.125rem]:pt-8 max-[53.125rem]:pb-16 max-[37.5rem]:pt-6 max-[37.5rem]:pb-10"
          aria-label="Account access"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export function AuthLoading() {
  return (
    <FormSkeleton label="Loading account form…" />
  );
}
