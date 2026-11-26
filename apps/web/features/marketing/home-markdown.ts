import { siteURL } from "@/lib/site";
import { supportEmail } from "@/lib/support";
import { homeFaq } from "./home-content";
import { plans } from "@/lib/plans";
import { deliveryLimits, monthlyPrice, planSummary, pricingPath, retryJitterPercent } from "./limits";
import { retrySchedule } from "./story";

// Markdown counterpart of components/marketing/landing-page.tsx. Limits mirror
// deliveries/lease.go, delivery/outcome.go, and delivery/client.go in apps/server.
export function homeMarkdown() {
  const docs = (path: string) => `${siteURL}${path}.md`;
  return `# Cascadehook

> Outbound webhook delivery service for SaaS and API teams. Publish an event once; Cascadehook signs it, delivers it to every subscribed endpoint, retries failures, and records every attempt.

Send webhooks to your customers without building the delivery infrastructure. Signed requests, automatic retries, and a record of every attempt are built in.

## How it works

1. **Publish.** Your application publishes an event with a project API key: \`POST /v1/events\` with an \`Idempotency-Key\` header. A \`202\` response means the event is stored, not yet delivered.
2. **Fan out.** Cascadehook creates one delivery for each enabled, verified endpoint subscribed to that event type.
3. **Sign.** Each request is signed with HMAC-SHA256 using the Standard Webhooks headers \`Webhook-Id\`, \`Webhook-Timestamp\`, and \`Webhook-Signature\`.
4. **Retry.** Your receiver verifies the signature over the raw body and returns a \`2xx\` response. Retryable failures are tried again on a backoff schedule.
5. **Record and replay.** You inspect every attempt in the dashboard or through the API, and replay a delivery once the endpoint is ready.

## Delivery behavior

- Up to 8 attempts per delivery within a 72-hour window.
- Default waits between attempts: ${retrySchedule.slice(1).map((step) => step.wait).join(", ")}, each varied by ±${retryJitterPercent}%. \`Retry-After\` can lengthen a wait but not shorten it.
- \`408\`, \`429\`, and \`5xx\` responses, timeouts, and network errors are retried. Other responses end the delivery.
- Each attempt has 30 seconds to finish, and only the first 4 KiB of the response is read.
- Destinations must be public HTTPS addresses. Private addresses are rejected and redirects are not followed.
- Replaying a delivery starts a new cycle with a fresh 72-hour window.

## Endpoints and security

- A new endpoint must answer a signed ownership challenge before it can be enabled. Enabling is a separate step.
- Signing secrets can be rotated. The previous secret keeps signing for 5 minutes so receivers can switch over.
- Project API keys are stored only as hashes and can be scoped to full access, publishing only, or read only.

## Pricing

Every plan includes Standard Webhooks signing, retries, replay, and delivery history. The free plan needs no card.

${plans.map((plan) => `- ${plan.name}, ${monthlyPrice(plan)} a month: ${planSummary(plan)}`).join("\n")}
- Every plan: ${deliveryLimits.attempts} attempts per delivery over ${deliveryLimits.windowHours} hours, and event payloads up to ${deliveryLimits.payloadKiB} KiB

Annual billing, limits, and refunds are on the [pricing page](${siteURL}${pricingPath}).

## FAQ

${homeFaq.map((item) => `### ${item.question}\n\n${item.answer}`).join("\n\n")}

## Get started

- [Send your first webhook](${docs("/docs/quickstart")})
- [How to send webhooks from your app](${docs("/docs/guides/send-webhooks")})
- [Verify webhook signatures](${docs("/docs/security/signatures")})
- [Project API reference](${docs("/docs/api")})
- [Set up with an AI agent](${siteURL}/docs/agents.md)
- [Cascadehook vs Svix, Hookdeck Outpost, Convoy, and building it yourself](${siteURL}/compare.md)
- [Free webhook tools](${siteURL}/tools.md)
- [Create an account](${siteURL}/login)

## Contact

- Email: ${supportEmail}
- Source: https://github.com/Shubbu03/cascadehook
`;
}
