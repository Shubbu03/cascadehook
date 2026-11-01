"use client";

import { SignIn, SignUp, useAuth, useClerk, useSession, useSignUp } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AmbientBackground } from "@/components/ambient-background";
import { Brand } from "@/components/brand";
import { FormSkeleton } from "@/features/workspace/skeletons";
import { apiRequest, ApiError } from "@/lib/api";
import { uuidPattern } from "@/lib/format";

type Phase = "joining" | "sign-in" | "profile" | "error";
type Receipt = { destination: string };

export function MagicInvitation({ invitationId, ticket }: { invitationId: string; ticket?: string }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { session } = useSession();
  const { signOut } = useClerk();
  const { signUp } = useSignUp();
  const [phase, setPhase] = useState<Phase>("joining");
  const [error, setError] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [retry, setRetry] = useState(0);
  const acceptance = useRef<{ key: string; promise: Promise<Receipt> } | null>(null);
  const registration = useRef<{ ticket: string; promise: Promise<Phase> } | null>(null);
  const destination = "/invitations/accept?invitation=" + encodeURIComponent(invitationId);

  useEffect(() => {
    if (!isLoaded) return;
    let ignore = false;
    async function enter() {
      if (session?.currentTask) return "sign-in" as const;
      if (isSignedIn && userId) {
        const key = userId + ":" + retry;
        if (acceptance.current?.key !== key) {
          acceptance.current = { key, promise: apiRequest<Receipt>(
            "/v1/invitations/" + encodeURIComponent(invitationId) + "/accept", getToken, { method: "POST" },
          ) };
        }
        const receipt = await acceptance.current.promise;
        const project = /^\/dashboard\/projects\/([a-f0-9-]+)$/i.exec(receipt.destination);
        const organization = /^\/dashboard\?organization=([a-f0-9-]+)$/i.exec(receipt.destination);
        if (!uuidPattern.test(project?.[1] ?? organization?.[1] ?? "")) {
          throw new Error("Your invitation was accepted. Open the dashboard to continue.");
        }
        if (!ignore) window.location.replace(receipt.destination);
        return "joining" as const;
      }
      if (!ticket || !signUp) return "sign-in" as const;
      if (registration.current?.ticket !== ticket) {
        registration.current = { ticket, promise: (async () => {
          const result = await signUp.ticket({ ticket });
          if (result.error) {
            throw new Error("This sign-up link couldn't be verified. Sign in if you already have an account, or ask the inviter to resend the email.");
          }
          if (signUp.status !== "complete") return "profile" as const;
          let next: Phase = "joining";
          await signUp.finalize({ navigate: ({ session: activeSession }) => {
            if (activeSession?.currentTask) next = "sign-in";
          } });
          return next;
        })() };
      }
      return registration.current.promise;
    }
    void enter().then((next) => { if (!ignore) setPhase(next); }).catch((failure: unknown) => {
      if (ignore) return;
      setError(failure instanceof Error ? failure.message : "Couldn't accept this invitation. Try again.");
      setMismatch(failure instanceof ApiError && failure.code === "invitation_email_mismatch");
      setPhase("error");
    });
    return () => { ignore = true; };
  }, [getToken, invitationId, isLoaded, isSignedIn, retry, session?.currentTask, signUp, ticket, userId]);

  const authProps = { routing: "hash" as const, forceRedirectUrl: destination, fallback: <FormSkeleton label="Loading account access…" /> };
  return (
    <div className="onboarding-page">
      <AmbientBackground />
      <header className="onboarding-header page-width"><Brand href="/" /><Link href="/" className="text-link">Back to home</Link></header>
      <div className="onboarding-body"><main id="main-content" className="onboarding-content invitation-entry">
        <div className="onboarding-card">
          <h1>{phase === "joining" ? "Joining your team…" : phase === "profile" ? "Finish your account" : "Accept your invitation"}</h1>
          {phase === "joining" && <FormSkeleton fields={1} label="Preparing your account and joining the organization…" />}
          {phase === "sign-in" && <><p className="section-description">Continue with the invited email. Your invitation will be accepted after you sign in.</p>
            <SignIn {...authProps} withSignUp signUpForceRedirectUrl={destination} signInUrl={destination} signUpUrl={destination + "#/create"} />
          </>}
          {phase === "profile" && <><p className="section-description">Your email is verified. Complete the information required for your account to join your team.</p>
            <SignUp {...authProps} signInUrl={destination} />
          </>}
          {phase === "error" && <>
            <p className="form-error" role="alert">{error}</p>
            <div className="invitation-entry-actions">
              {mismatch ? <button type="button" className="button" onClick={() => { void signOut({ redirectUrl: destination + (ticket ? "&__clerk_ticket=" + encodeURIComponent(ticket) : "") }); }}>Switch account</button>
                : isSignedIn ? <button type="button" className="button" onClick={() => { setPhase("joining"); setRetry((value) => value + 1); }}>Try again</button>
                : <button type="button" className="button" onClick={() => setPhase("sign-in")}>Sign in</button>}
              <Link className="button button-secondary" href="/dashboard">Open dashboard</Link>
            </div>
          </>}
        </div>
      </main></div>
    </div>
  );
}
