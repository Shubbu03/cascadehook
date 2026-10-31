import { auth } from "@clerk/nextjs/server";
import { LockKeyIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isAuthConfigured } from "@/lib/server/auth";
import { LoginForm } from "./login-form";

export async function AuthForm() {
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
  return <LoginForm />;
}
