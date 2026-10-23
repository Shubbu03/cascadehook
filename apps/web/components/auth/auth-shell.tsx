import { ArrowLeftIcon, CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";

export function AuthShell({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: "sign-in" | "sign-up";
}) {
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="eyebrow">THE LAST MILE, TAKEN CARE OF</span>
          <h2>
            Your events.
            <br />
            In good hands.
          </h2>
          <p>
            Build the things your customers came for. We&apos;ll take care of
            getting your webhooks where they need to go.
          </p>
          <ul className="auth-promises">
            {[
              "Signed requests to your endpoints",
              "Retries when things don't go to plan",
              "A clear record of every attempt",
            ].map((item) => (
              <li key={item}>
                <CheckCircleIcon size={18} aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="auth-story-footnote">
          A little less infrastructure. A lot more building.
        </p>
      </aside>
      <div className="auth-main">
        <header className="auth-topbar">
          <Link href="/" className="text-link">
            <ArrowLeftIcon size={16} aria-hidden="true" />
            Back to home
          </Link>
          <ThemeSwitcher />
        </header>
        <main id="main-content" className="auth-form-area">
          <div className="auth-mobile-brand">
            <Brand />
          </div>
          <div className="auth-intro">
            <span className="eyebrow">
              {mode === "sign-up"
                ? "LET'S GET YOU STARTED"
                : "PICK UP WHERE YOU LEFT OFF"}
            </span>
            <h1>
              {mode === "sign-up"
                ? "Make room for better webhooks."
                : "Welcome back."}
            </h1>
            <p>
              {mode === "sign-up"
                ? "Your next event starts here."
                : "Your projects are right where you left them."}
            </p>
          </div>
          {children}
        </main>
        <footer className="auth-page-footer">Webhooks, delivered.</footer>
      </div>
    </div>
  );
}

export function AuthLoading() {
  return (
    <div className="auth-loading" role="status">
      <span className="loading-dot" aria-hidden="true" />
      Loading secure sign-in…
    </div>
  );
}
