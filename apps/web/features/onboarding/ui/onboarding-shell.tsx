import { UserButton } from "@clerk/nextjs";
import { AmbientBackground } from "@/components/ambient-background";
import { Brand } from "@/components/brand";

export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="onboarding-page">
      <AmbientBackground />
      <header className="onboarding-header page-width">
        <Brand />
        <UserButton />
      </header>
      <div className="onboarding-body">{children}</div>
    </div>
  );
}
