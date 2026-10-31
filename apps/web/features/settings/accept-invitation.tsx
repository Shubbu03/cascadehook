"use client";

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
    <div className="onboarding-page">
      <AmbientBackground />
      <header className="onboarding-header page-width">
        <Brand href={isSignedIn ? "/dashboard" : "/"} />
        <Link href="/" className="text-link">
          Back to home
        </Link>
      </header>
      <div className="onboarding-body">
        <main id="main-content" className="onboarding-content">
          <div className="onboarding-card">
            <h1>Join organization</h1>
            {!isLoaded ? (
              <FormSkeleton fields={1} label="Loading your account…" />
            ) : !isSignedIn ? (
              <>
                <p className="section-description">
                  Sign in with the invited email, then reopen your invitation
                  link.
                </p>
                <Link className="button button-primary" href="/login">
                  Sign in
                </Link>
              </>
            ) : (
              <form onSubmit={accept} aria-busy={busy}>
                <label className="form-field">
                  <span>Invitation link or token</span>
                  <input
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
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={busy}
                >
                  {busy ? "Joining…" : "Accept invitation"}
                </button>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
