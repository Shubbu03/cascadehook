"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ConnectionError } from "@/features/workspace/connection-error";

export function OnboardingError({ message }: { message: string; }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <main id="main-content" className="w-[min(460px,calc(100%-40px))] mx-auto">
      <ConnectionError
        title="Couldn't load setup"
        error={new Error(message)}
        retry={() => startTransition(() => router.refresh())}
        pending={pending}
      />
    </main>
  );
}
