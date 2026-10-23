import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthLoading, AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthShell mode="sign-in">
      <Suspense fallback={<AuthLoading />}>
        <AuthForm mode="sign-in" />
      </Suspense>
    </AuthShell>
  );
}
