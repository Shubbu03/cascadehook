import type { Organization } from "@/features/workspace/types";
import { createProject } from "./data-access/create-project";
import { OnboardingForm } from "./ui/onboarding-form";

export function ProjectStep({ organization }: { organization: Organization }) {
  return (
    <OnboardingForm
      step="project"
      action={createProject}
      organization={organization}
    />
  );
}
