import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthLoading, AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <AuthShell mode="sign-up">
      <Suspense fallback={<AuthLoading />}>
        <AuthForm mode="sign-up" />
      </Suspense>
    </AuthShell>
  );
}
