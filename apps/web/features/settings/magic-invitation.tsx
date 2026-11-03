"use client";

import { Button, buttonStyles } from "@/components/button";

import { SignIn, SignUp, useAuth, useClerk, useSession, useSignUp } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AmbientBackground } from "@/components/ambient-background";
import { Brand } from "@/components/brand";
import { FormSkeleton } from "@/features/workspace/skeletons";
import { apiRequest, ApiError } from "@/lib/api";
import { uuidPattern } from "@/lib/format";

type Phase = "joining" | "sign-in" | "profile" | "error";
type Receipt = { destination: string; };

export function MagicInvitation({ invitationId, ticket }: { invitationId: string; ticket?: string; }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { session } = useSession();
  const { signOut } = useClerk();
  const { signUp } = useSignUp();
  const [phase, setPhase] = useState<Phase>("joining");
  const [error, setError] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [retry, setRetry] = useState(0);
  const acceptance = useRef<{ key: string; promise: Promise<Receipt>; } | null>(null);
  const registration = useRef<{ ticket: string; promise: Promise<Phase>; } | null>(null);
  const destination = "/invitations/accept?invitation=" + encodeURIComponent(invitationId);

  useEffect(() => {
    if (!isLoaded) return;
    let ignore = false;
    async function enter() {
      if (session?.currentTask) return "sign-in" as const;
      if (isSignedIn && userId) {
        const key = userId + ":" + retry;
        if (acceptance.current?.key !== key) {
          acceptance.current = {
            key, promise: apiRequest<Receipt>(
              "/v1/invitations/" + encodeURIComponent(invitationId) + "/accept", getToken, { method: "POST" },
            )
          };
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
        registration.current = {
          ticket, promise: (async () => {
            const result = await signUp.ticket({ ticket });
            if (result.error) {
              throw new Error("This sign-up link couldn't be verified. Sign in if you already have an account, or ask the inviter to resend the email.");
            }
            if (signUp.status !== "complete") return "profile" as const;
            let next: Phase = "joining";
            await signUp.finalize({
              navigate: ({ session: activeSession }) => {
                if (activeSession?.currentTask) next = "sign-in";
              }
            });
            return next;
          })()
        };
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
    <div className="relative isolate flex flex-col min-h-svh">
      <AmbientBackground />
      <header data-ui="onboarding-header" className="w-[min(1200px,calc(100%-80px))] relative z-1 flex items-center justify-between min-h-22 mx-auto gap-5 max-[65.625rem]:w-[calc(100%-56px)] max-[37.5rem]:w-[calc(100%-40px)] max-[37.5rem]:min-h-20 max-[37.5rem]:flex-wrap max-[37.5rem]:gap-3"><Brand href="/" /><Link href="/" className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 min-h-11 text-muted text-[13px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] max-[37.5rem]:text-[12px]">Back to home</Link></header>
      <div className="relative z-1 grid items-center flex-1 pt-9 pb-22 max-[37.5rem]:pt-6 max-[37.5rem]:pb-12"><main id="main-content" data-ui="invitation-entry" className="w-[min(460px,calc(100%-40px))] mx-auto [&_.cl-rootBox]:w-full [&_.cl-rootBox]:max-w-full [&_.cl-cardBox]:w-full [&_.cl-cardBox]:max-w-full">
        <div data-ui="onboarding-card" className="rounded-xl bg-surface p-8 border border-solid border-border [&_h1]:text-[26px] [&_h1]:tracking-[-0.035em] [&_form]:mt-7 max-w-130 max-[37.5rem]:p-6 max-[37.5rem]:[&_h1]:text-[24px]">
          <h1>{phase === "joining" ? "Joining your team…" : phase === "profile" ? "Finish your account" : "Accept your invitation"}</h1>
          {phase === "joining" && <FormSkeleton fields={1} label="Preparing your account and joining the organization…" />}
          {phase === "sign-in" && <><p className="mt-3 text-muted text-[14px] leading-[1.8] max-w-162.5 in-data-[ui~='dashboard-main']:text-[13px] mb-6">Continue with the invited email. Your invitation will be accepted after you sign in.</p>
            <SignIn {...authProps} withSignUp signUpForceRedirectUrl={destination} signInUrl={destination} signUpUrl={destination + "#/create"} />
          </>}
          {phase === "profile" && <><p className="mt-3 text-muted text-[14px] leading-[1.8] max-w-162.5 in-data-[ui~='dashboard-main']:text-[13px] mb-6">Your email is verified. Complete the information required for your account to join your team.</p>
            <SignUp {...authProps} signInUrl={destination} />
          </>}
          {phase === "error" && <>
            <p className="text-danger text-[13px] my-3" role="alert">{error}</p>
            <div className="flex flex-wrap mt-5 gap-3.5">
              {mismatch ? <Button type="button" data-ui="button" className="w-full mt-1.5" onClick={() => { void signOut({ redirectUrl: destination + (ticket ? "&__clerk_ticket=" + encodeURIComponent(ticket) : "") }); }}>Switch account</Button>
                : isSignedIn ? <Button type="button" data-ui="button" className="w-full mt-1.5" onClick={() => { setPhase("joining"); setRetry((value) => value + 1); }}>Try again</Button>
                  : <Button type="button" data-ui="button" className="w-full mt-1.5" onClick={() => setPhase("sign-in")}>Sign in</Button>}
              <Link data-ui="button" className={buttonStyles({ variant: "secondary", className: "w-full mt-1.5" })} href="/dashboard">Open dashboard</Link>
            </div>
          </>}
        </div>
      </main></div>
    </div>
  );
}
