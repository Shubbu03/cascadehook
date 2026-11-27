import type { FaqItem } from "@/components/marketing/faq-list";

export const planBlurbs: Record<string, string> = {
  free: "Try the full delivery flow on a small project.",
  starter: "For independent developers shipping webhooks.",
  growth: "For growing products and small teams.",
};

export const pricingFaq: FaqItem[] = [
  {
    question: "What counts as a delivery?",
    answer:
      "One event scheduled for one endpoint is one delivery, even if that receiver later fails. An event sent to three endpoints counts as three. Automatic retries are included; a manual replay counts as another delivery.",
  },
  {
    question: "What happens at a limit?",
    answer:
      "We warn at 80% and 100%. New publications or replays that exceed an allowance are rejected with an explicit error. Accepted deliveries and their retries continue, and you keep access to the dashboard. There are no automatic overage fees.",
  },
  {
    question: "When do allowances reset?",
    answer:
      "Monthly event and delivery allowances are shared across projects in an organization and reset on the first day of each calendar month at 00:00 UTC. This also applies to annual subscriptions. Plan changes do not reset usage.",
  },
  {
    question: "Can I cancel or request a refund?",
    answer:
      "Cancel future renewals through Billing. Your paid access remains until the end of the paid period. You can request a refund within seven days of your first purchase.",
    link: { href: "/refunds", label: "Read the refund and cancellation policy" },
  },
  {
    question: "What happens to existing workspaces?",
    answer:
      "Workspaces created before these plans keep their existing allowances until they choose a paid plan. Their dashboard shows the actual limits that apply.",
  },
];
