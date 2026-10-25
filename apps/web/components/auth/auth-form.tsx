import { SignIn, SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { LockKeyIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isAuthConfigured } from "@/lib/server/auth";

const formAppearance = {
  elements: {
    rootBox: "auth-widget",
    cardBox: "auth-card-box",
    card: "auth-card",
    footer: "auth-footer",
    formButtonPrimary: "auth-primary-button",
    socialButtonsBlockButton: "auth-social-button",
  },
};

export async function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  await connection();
  if (!isAuthConfigured()) {
    return (
      <div className="empty-state auth-unavailable">
        <LockKeyIcon size={28} className="text-accent" aria-hidden="true" />
        <h3>Account access unavailable</h3>
        <p>Please try again later.</p>
        <Link href="/" className="button button-secondary">
          Back to Cascadehook
        </Link>
      </div>
    );
  }
  const { userId } = await auth();
  if (userId) redirect("/dashboard");
  return mode === "sign-in" ? (
    <SignIn
      appearance={formAppearance}
      routing="path"
      path="/sign-in"
      signUpUrl="/sign-up"
      fallbackRedirectUrl="/dashboard"
    />
  ) : (
    <SignUp
      appearance={formAppearance}
      routing="path"
      path="/sign-up"
      signInUrl="/sign-in"
      fallbackRedirectUrl="/onboarding"
    />
  );
}
