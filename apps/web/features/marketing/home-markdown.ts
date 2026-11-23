import { siteURL } from "@/lib/site";
import { supportEmail } from "@/lib/support";

// Markdown counterpart of components/marketing/landing-page.tsx. Limits mirror
// deliveries/lease.go, delivery/outcome.go, and delivery/client.go in apps/server.
export function homeMarkdown() {
  const docs = (path: string) => `${siteURL}${path}.md`;
  return `# Cascadehook

> Outbound webhooks for your application. Publish an event once; Cascadehook signs it, delivers it to every subscribed endpoint, retries failures, and records every attempt.

Send events to your customers without building the delivery infrastructure. Signed requests, automatic retries, and a record of every attempt are built in.

## How it works

1. Your application publishes an event with a project API key: \`POST /v1/events\` with an \`Idempotency-Key\` header. A \`202\` response means the event is stored, not yet delivered.
2. Cascadehook creates one delivery for each enabled, verified endpoint subscribed to that event type.
3. Each request is signed with HMAC-SHA256 using the Standard Webhooks headers \`Webhook-Id\`, \`Webhook-Timestamp\`, and \`Webhook-Signature\`.
4. Your receiver verifies the signature over the raw body, stores the event, and returns a \`2xx\` response.
5. You inspect every attempt in the dashboard or through the API, and replay a delivery once the endpoint is ready.

## Delivery behavior

- Up to 8 attempts per delivery within a 72-hour window.
- Jittered backoff between attempts, from about 15 seconds up to 18 hours. \`Retry-After\` can lengthen a wait but not shorten it.
- \`408\`, \`429\`, and \`5xx\` responses, timeouts, and network errors are retried. Other responses end the delivery.
- Each attempt has 30 seconds to finish, and only the first 4 KiB of the response is read.
- Destinations must be public HTTPS addresses. Private addresses are rejected and redirects are not followed.
- Replaying a delivery starts a new cycle with a fresh 72-hour window.

## Endpoints and security

- A new endpoint must answer a signed ownership challenge before it can be enabled. Enabling is a separate step.
- Signing secrets can be rotated. The previous secret keeps signing for 5 minutes so receivers can switch over.
- Project API keys are stored only as hashes and can be scoped to full access, publishing only, or read only.

## Pricing

Cascadehook is currently available without a paid subscription. Usage limits apply, and the dashboard shows the allowances for your organization.

## Get started

- [Send your first webhook](${docs("/docs/quickstart")})
- [How to send webhooks from your app](${docs("/docs/guides/send-webhooks")})
- [Verify webhook signatures](${docs("/docs/security/signatures")})
- [Project API reference](${docs("/docs/api")})
- [Set up with an AI agent](${siteURL}/docs/agents.md)
- [Free webhook tools](${siteURL}/tools.md)
- [Create an account](${siteURL}/login)

## Contact

- Email: ${supportEmail}
- Source: https://github.com/Shubbu03/cascadehook
`;
}
