import { ClerkProvider } from "@clerk/nextjs";
import { connection } from "next/server";
import { Suspense } from "react";
import { isAuthConfigured } from "@/lib/server/auth";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <main id="main-content" className="auth-loading" role="status">
          Loading your account…
        </main>
      }
    >
      <ConfiguredAccount>{children}</ConfiguredAccount>
    </Suspense>
  );
}

async function ConfiguredAccount({ children }: { children: React.ReactNode }) {
  await connection();
  if (!isAuthConfigured()) return children;

  return (
    <ClerkProvider
      dynamic
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/onboarding"
      signUpFallbackRedirectUrl="/onboarding"
      afterSignOutUrl="/"
      localization={{
        signIn: {
          start: { title: "Sign in", subtitle: "", subtitleCombined: "" },
        },
        signUp: {
          start: {
            title: "Create an account",
            subtitle: "",
            subtitleCombined: "",
          },
        },
      }}
      appearance={{
        cssLayerName: "clerk",
        elements: { formFieldInput: "account-input" },
        variables: {
          colorPrimary: "var(--accent)",
          colorPrimaryForeground: "var(--accent-foreground)",
          colorBackground: "var(--surface)",
          colorForeground: "var(--foreground)",
          colorMuted: "var(--surface-hover)",
          colorMutedForeground: "var(--muted)",
          colorInput: "var(--surface)",
          colorInputForeground: "var(--foreground)",
          colorBorder: "var(--input-border)",
          colorDanger: "var(--danger)",
          colorSuccess: "var(--success)",
          colorWarning: "var(--warning)",
          fontFamily: "var(--font-plex-sans), sans-serif",
          borderRadius: "0.5rem",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
