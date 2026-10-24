import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { AmbientBackground } from "@/components/ambient-background";
import { Brand } from "@/components/brand";

export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="onboarding-page">
      <AmbientBackground />
      <header className="onboarding-header page-width">
        <Brand />
        <div className="onboarding-header-actions">
          <Link href="/" className="text-link">
            Back to home
          </Link>
          <UserButton />
        </div>
      </header>
      <div className="onboarding-body">{children}</div>
    </div>
  );
}
