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
    <div className="auth-page">
      <aside className="auth-story">
        {brand}
        <div className="auth-story-content">
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
      <div className="auth-main">
        <header className="auth-topbar">
          <div className="auth-mobile-brand">
            {brand}
          </div>
          <nav aria-label="Page navigation">
            <Link href="/" className="text-link">
              <ArrowLeftIcon size={16} aria-hidden="true" />
              Back to home
            </Link>
          </nav>
        </header>
        <main
          id="main-content"
          className="auth-form-area"
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
