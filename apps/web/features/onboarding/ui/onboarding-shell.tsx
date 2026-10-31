import { UserButton } from "@clerk/nextjs";
import { AmbientBackground } from "@/components/ambient-background";
import { Brand } from "@/components/brand";
import { Notifications } from "@/components/notifications";

export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <Notifications>
      <div className="onboarding-page">
        <AmbientBackground />
        <header className="onboarding-header page-width">
          <Brand />
          <UserButton />
        </header>
        <div className="onboarding-body">{children}</div>
      </div>
    </Notifications>
  );
}
