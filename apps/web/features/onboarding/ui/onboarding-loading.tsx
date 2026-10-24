export function OnboardingLoading() {
  return (
    <main id="main-content" className="onboarding-content" role="status">
      <span className="sr-only">Loading setup…</span>
      <div className="onboarding-skeleton skeleton" />
    </main>
  );
}
