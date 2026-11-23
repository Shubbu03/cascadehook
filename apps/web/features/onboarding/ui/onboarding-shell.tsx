import { UserButton } from "@clerk/nextjs";
import { AmbientBackground } from "@/components/ambient-background";
import { Brand } from "@/components/brand";
import { Notifications } from "@/components/notifications";

export function OnboardingShell({ children }: { children: React.ReactNode; }) {
  return (
    <Notifications>
      <div className="relative isolate flex flex-col min-h-svh">
        <AmbientBackground />
        <header data-ui="onboarding-header" className="w-[min(1200px,calc(100%-80px))] relative z-1 flex items-center justify-between min-h-22 mx-auto gap-5 max-[65.625rem]:w-[calc(100%-56px)] max-[37.5rem]:w-[calc(100%-40px)] max-[37.5rem]:min-h-20 max-[37.5rem]:flex-wrap max-[37.5rem]:gap-3">
          <Brand />
          <UserButton />
        </header>
        <div className="relative z-1 grid items-center flex-1 pt-9 pb-22 max-[37.5rem]:pt-6 max-[37.5rem]:pb-12">{children}</div>
      </div>
    </Notifications>
  );
}
