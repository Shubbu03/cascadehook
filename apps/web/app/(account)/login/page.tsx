import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthLoading, AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Sign in or create an account" };

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={<AuthLoading />}>
        <AuthForm />
      </Suspense>
    </AuthShell>
  );
}
