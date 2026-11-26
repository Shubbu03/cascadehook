import { siteName } from "@/lib/site";
import { cheapestPaidPlan, deliveryLimits, freePlan, monthlyDeliveries, monthlyPrice } from "../limits";

export const comparePath = "/compare";
export const compareUpdated = "2026-11-24";
// Update whenever competitor facts are re-checked against their docs and pricing pages.
export const compareChecked = "November 23, 2026";

export const compareTitle = "Webhook delivery services compared";
export const compareMetaTitle = "Svix vs Hookdeck Outpost vs Convoy vs Cascadehook";
export const compareDescription =
  "Compare Cascadehook, Svix, Hookdeck Outpost, Convoy, and building webhooks yourself: hosting, free tiers, pricing, signing, retries, portals, and SDKs.";
export const compareIntro =
  "Four ways to send webhooks to your customers without writing the delivery system from scratch, plus what it takes if you do. Each one wins somewhere, so this page says where.";

export const options = ["Cascadehook", "Svix", "Hookdeck Outpost", "Convoy", "Build it yourself"] as const;

type Row = { label: string; values: [string, string, string, string, string] };

export const compareRows: Row[] = [
  {
    label: "Hosting",
    values: [
      "Managed cloud",
      "Managed cloud, or self-host the MIT-licensed server",
      "Managed cloud, or self-host (Apache-2.0)",
      "Managed cloud, or self-host (Elastic License 2.0, source-available)",
      "Your infrastructure",
    ],
  },
  {
    label: "Free tier",
    values: [
      `${monthlyDeliveries(freePlan)} deliveries a month; no card required`,
      "50,000 messages a month",
      "First 50,000 events free on the managed service; self-hosting is free",
      "Self-hosted Community edition is free; the cloud has a 14-day trial",
      "Your infrastructure and engineering time",
    ],
  },
  {
    label: "Paid plans from",
    values: [
      `${monthlyPrice(cheapestPaidPlan)} a month (${cheapestPaidPlan.name})`,
      "$20 a month (Basic)",
      "$10 per million events after the free 50,000 (Starter)",
      "$999 a month for self-hosted Premium; cloud prices aren't published",
      "—",
    ],
  },
  {
    label: "Signing",
    values: [
      "Standard Webhooks",
      "Standard Webhooks",
      "Standard Webhooks compatible",
      "Signed payloads; Standard Webhooks support isn't stated",
      "You build and maintain it",
    ],
  },
  {
    label: "Default retries",
    values: [
      `${deliveryLimits.attempts} attempts over ${deliveryLimits.windowHours} hours, with jittered backoff`,
      "8 attempts over about 28 hours",
      "Exponential backoff or a custom schedule",
      "Constant or exponential backoff with jitter",
      "You build it",
    ],
  },
  {
    label: "Destinations",
    values: [
      "HTTPS endpoints",
      "HTTPS endpoints; object storage and message brokers on higher plans",
      "HTTPS, SQS, EventBridge, Kinesis, S3, Pub/Sub, Azure Service Bus, RabbitMQ, Kafka, and more",
      "HTTPS endpoints and message brokers",
      "Anything you build",
    ],
  },
  {
    label: "Customer portal",
    values: [
      "Not yet; manage endpoints through the API",
      "Embeddable App Portal",
      "Tenant portal, or build your own on its API",
      "Embeddable customer dashboard",
      "You build it",
    ],
  },
  {
    label: "Official SDKs",
    values: [
      "None yet; REST API with an OpenAPI spec",
      "JavaScript, Python, Go, Java, Kotlin, Ruby, Rust, PHP, and C#",
      "Go, Python, and TypeScript",
      "Go, Python, JavaScript, Ruby, PHP, and Java",
      "—",
    ],
  },
];

export const choices: { name: string; when: string }[] = [
  {
    name: siteName,
    when: `You want a hosted service that's quick to adopt and strict by default: Standard Webhooks signatures, a signed ownership challenge before any endpoint can be enabled, deliveries only to public HTTPS addresses with redirects never followed, and every attempt kept for inspection and replay. It has a free plan, and paid plans start at ${monthlyPrice(cheapestPaidPlan)} a month. It's also young: there's no customer portal or SDK yet, and it delivers only to HTTPS endpoints.`,
  },
  {
    name: "Svix",
    when: "You want the most established option: an embeddable portal where your customers manage their own endpoints, SDKs in many languages, and enterprise features such as SSO and static IPs. You can also self-host its MIT-licensed server.",
  },
  {
    name: "Hookdeck Outpost",
    when: "You want to self-host under Apache-2.0, or deliver events to queues and streams such as SQS, Kafka, or Pub/Sub as well as to webhooks.",
  },
  {
    name: "Convoy",
    when: "You want one self-hosted gateway for both incoming and outgoing webhooks, with circuit breaking and payload transforms. It's licensed under the Elastic License 2.0, which is source-available rather than open source.",
  },
  {
    name: "Building it yourself",
    when: "Webhooks are core to your product and you have a team to own them for the long run. The list below is what you'd be taking on.",
  },
];

export const buildChecklist = [
  "A durable queue, so events survive restarts and deploys.",
  "Retries with backoff and jitter, and rules for which responses count as failures.",
  "HMAC signing, secret storage, and secret rotation that doesn't break receivers.",
  "SSRF protection: block private addresses, check them again after DNS resolution, and never follow redirects.",
  "Timeouts and response size limits, so slow endpoints can't tie up workers.",
  "Idempotent publishing, so retries from your own app don't create duplicate events.",
  "A log of every attempt, and replay, for when a customer asks what happened.",
  "Endpoint verification, so customers can't point your webhooks at hosts they don't control.",
  "Monitoring and alerts on failure rates.",
];

export const compareSources = [
  { label: "Svix pricing", href: "https://www.svix.com/pricing/" },
  { label: "Svix retry schedule", href: "https://docs.svix.com/retries" },
  { label: "Svix open-source server", href: "https://www.svix.com/open-source-webhook-service/" },
  { label: "Hookdeck Outpost on GitHub", href: "https://github.com/hookdeck/outpost" },
  { label: "Hookdeck Outpost features", href: "https://hookdeck.com/docs/outpost/features" },
  { label: "Hookdeck Outpost pricing", href: "https://hookdeck.com/outpost/pricing" },
  { label: "Convoy on GitHub", href: "https://github.com/frain-dev/convoy" },
  { label: "Convoy pricing", href: "https://getconvoy.io/pricing" },
];

export const compareTrademark = `Svix, Hookdeck, and Convoy are trademarks of their respective owners. ${siteName} isn't affiliated with or endorsed by any of them.`;
export const compareDisclosure = `${siteName} wrote this page and has tried to keep it fair.`;
