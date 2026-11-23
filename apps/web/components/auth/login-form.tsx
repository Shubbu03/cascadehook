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
    <div className="min-w-0">
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
            rootBox: "min-w-0 w-full max-w-full",
            cardBox: "min-w-0 w-full max-w-full shadow-none rounded-xl border border-solid border-border",
            card: "w-full min-w-0 shadow-none bg-surface p-7 max-[37.5rem]:p-5.5",
            footer: "bg-background bg-none",
            footerAction__signUp: { display: "none" },
            formButtonPrimary: "min-h-10.5 font-medium normal-case shadow-none",
            socialButtonsBlockButton: "min-h-10.5",
          },
        }}
      />
      {(step === "" || creating) && (
        <p className="mt-5 text-muted text-[13px] leading-[1.6] text-center [&_a]:text-accent [&_a]:font-medium [&_a]:underline [&_a]:decoration-transparent [&_a]:underline-offset-4 [&_a]:[transition:text-decoration-color_160ms_ease] [&_a:hover]:decoration-current [&_a:focus-visible]:decoration-current">
          {creating ? "Already have an account?" : "New here?"}{" "}
          <a href={creating ? "#/" : "#/create"}>
            {creating ? "Sign in" : "Create account"}
          </a>
        </p>
      )}
    </div>
  );
}
