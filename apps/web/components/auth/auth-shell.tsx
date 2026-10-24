import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { isAuthConfigured } from "@/lib/server/auth";
import { AuthBrand } from "./auth-brand";

export function AuthShell({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: "sign-in" | "sign-up";
}) {
  const isSignUp = mode === "sign-up";
  const brand = isAuthConfigured() ? <AuthBrand /> : <Brand href="/" />;

  return (
    <div className="auth-page">
      <aside className="auth-story">
        {brand}
        <div className="auth-story-content">
          <h2>
            {isSignUp ? "Start" : "Welcome"}
            <br />
            <span>{isSignUp ? "building." : "back."}</span>
          </h2>
          <p>
            {isSignUp
              ? "Create an account and connect your first endpoint."
              : "Sign in to manage your projects and deliveries."}
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
          aria-label={isSignUp ? "Create an account" : "Sign in"}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export function AuthLoading() {
  return (
    <div className="auth-loading" role="status">
      <span className="loading-dot" aria-hidden="true" />
      Loading…
    </div>
  );
}
