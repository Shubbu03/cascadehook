import { createOrganization } from "./data-access/create-organization";
import { OnboardingForm } from "./ui/onboarding-form";

export function OrganizationStep() {
  return <OnboardingForm step="organization" action={createOrganization} />;
}
