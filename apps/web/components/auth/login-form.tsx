"use client";

import { SignIn } from "@clerk/nextjs";
import { useSyncExternalStore } from "react";
import { FormSkeleton } from "@/features/workspace/skeletons";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function currentStep() {
  return window.location.hash.slice(1).split("?")[0].replace(/^\/|\/$/g, "");
}

function serverStep() {
  return "";
}

export function LoginForm() {
  const step = useSyncExternalStore(subscribe, currentStep, serverStep);
  const creating = step === "create";

  return (
    <div className="auth-login">
      <SignIn
        routing="hash"
        withSignUp
        signInUrl="/login"
        signUpUrl="/login#/create"
        fallbackRedirectUrl="/dashboard"
        signUpFallbackRedirectUrl="/onboarding"
        fallback={<FormSkeleton label="Loading account form…" />}
        appearance={{
          options: { socialButtonsPlacement: "top", socialButtonsVariant: "blockButton" },
          elements: {
            rootBox: "auth-widget",
            cardBox: "auth-card-box",
            card: "auth-card",
            footer: "auth-footer",
            footerAction__signUp: { display: "none" },
            formButtonPrimary: "auth-primary-button",
            socialButtonsBlockButton: "auth-social-button",
          },
        }}
      />
      {(step === "" || creating) && (
        <p className="auth-mode-switch">
          {creating ? "Already have an account?" : "New here?"}{" "}
          <a href={creating ? "#/" : "#/create"}>
            {creating ? "Sign in" : "Create account"}
          </a>
        </p>
      )}
    </div>
  );
}
