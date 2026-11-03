"use client";

import { Input } from "@/components/input";

import { Button, buttonStyles } from "@/components/button";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { AmbientBackground } from "@/components/ambient-background";
import { Brand } from "@/components/brand";
import { FormSkeleton } from "@/features/workspace/skeletons";
import { apiRequest } from "@/lib/api";
import type { Membership } from "./types";
import { invitationToken } from "./invitation-token";

export function AcceptInvitation() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSignedIn) return;
    const field = input.current;
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
    if (field && token) field.value = invitationToken(token) ?? "";
    return () => {
      if (field) field.value = "";
      generation.current += 1;
      pending.current = false;
      setBusy(false);
    };
  }, [isSignedIn, userId]);

  async function accept(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const token = invitationToken(
      String(new FormData(event.currentTarget).get("token") ?? ""),
    );
    if (!token) {
      setError("Paste a valid invitation link or token.");
      return;
    }
    pending.current = true;
    const current = ++generation.current;
    setBusy(true);
    setError("");
    try {
      await apiRequest<Membership>("/v1/invitations/accept", getToken, {
        method: "POST",
        data: { token },
      });
      if (generation.current === current) {
        if (input.current) input.current.value = "";
        router.replace("/onboarding");
        router.refresh();
      }
    } catch (error) {
      if (generation.current === current)
        setError(
          error instanceof Error
            ? error.message
            : "Couldn't accept this invitation.",
        );
    } finally {
      if (generation.current === current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <div className="relative isolate flex flex-col min-h-svh">
      <AmbientBackground />
      <header data-ui="onboarding-header" className="w-[min(1200px,calc(100%-80px))] relative z-1 flex items-center justify-between min-h-22 mx-auto gap-5 max-[65.625rem]:w-[calc(100%-56px)] max-[37.5rem]:w-[calc(100%-40px)] max-[37.5rem]:min-h-20 max-[37.5rem]:flex-wrap max-[37.5rem]:gap-3">
        <Brand href={isSignedIn ? "/dashboard" : "/"} />
        <Link href="/" className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 min-h-11 text-muted text-[13px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] max-[37.5rem]:text-[12px]">
          Back to home
        </Link>
      </header>
      <div className="relative z-1 grid items-center flex-1 pt-9 pb-22 max-[37.5rem]:pt-6 max-[37.5rem]:pb-12">
        <main id="main-content" className="w-[min(460px,calc(100%-40px))] mx-auto">
          <div data-ui="onboarding-card" className="rounded-xl bg-surface p-8 border border-solid border-border [&_h1]:text-[26px] [&_h1]:tracking-[-0.035em] [&_form]:mt-7 max-[37.5rem]:p-6 max-[37.5rem]:[&_h1]:text-[24px]">
            <h1>Join organization</h1>
            {!isLoaded ? (
              <FormSkeleton fields={1} label="Loading your account…" />
            ) : !isSignedIn ? (
              <>
                <p className="mt-3 mb-4.5 text-muted text-[14px] leading-[1.8] max-w-162.5 in-data-[ui~='dashboard-main']:text-[13px]">
                  Sign in with the invited email, then reopen your invitation
                  link.
                </p>
                <Link data-ui="button" className={buttonStyles({ className: "w-full mt-1.5" })} href="/login">
                  Sign in
                </Link>
              </>
            ) : (
              <form onSubmit={accept} aria-busy={busy}>
                <label data-ui="form-field" className="grid mb-4.5 gap-2 [&_>_span]:text-[13px] [&_>_span]:font-medium [&_>_label]:text-[13px] [&_>_label]:font-medium">
                  <span>Invitation link or token</span>
                  <Input className="[[data-ui~='dashboard-main']_&]:min-h-10 [[data-ui~='dashboard-main']_&]:text-[14px] [[data-ui~='dashboard-main']_&]:py-2.25 [[data-ui~='dashboard-main']_&]:px-3 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] w-full min-h-11.5 rounded-md text-foreground text-[16px] py-2.75 px-3 placeholder:text-muted bg-surface-hover shadow-[inset_0_-2px_transparent] transition-shadow border-0 border-none border-current focus-visible:outline-hidden focus-visible:shadow-[inset_0_-2px_var(--accent)]"
                    ref={input}
                    name="token"
                    type="text"
                    required
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={busy}
                  />
                </label>
                {error && (
                  <p className="text-danger text-[13px] my-3" role="alert">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  data-ui="button" className="w-full mt-1.5"
                  disabled={busy}
                >
                  {busy ? "Joining…" : "Accept invitation"}
                </Button>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
