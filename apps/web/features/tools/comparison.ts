import { siteURL } from "@/lib/site";
import { verifierContents } from "./content";
import type { Adapter, ProviderId } from "./verifier/core";
import { adapters } from "./verifier/providers";

export const comparisonPath = "/tools/webhook-signature-comparison";
export const comparisonChecked = "November 7, 2026";

type ComparisonRow = {
  name: string;
  verifier?: string;
  headers: string[];
  message: string;
  encoding: string;
  key: string;
  tolerance: string;
  retries: string;
  deadline: string;
  source: { label: string; href: string };
};

type Policy = Pick<ComparisonRow, "retries" | "deadline" | "source"> & { tolerance?: string };

// Retry, deadline, and tolerance policies come from each provider's documentation;
// update `comparisonChecked` whenever they are re-checked.
const policies: Record<ProviderId, Policy> = {
  "standard-webhooks": {
    retries: "Recommends exponential backoff with jitter over several days. Each sender sets its own schedule.",
    deadline: "Recommends a 15 to 30 second timeout.",
    tolerance: "Not fixed by the spec. The official libraries allow 5 minutes.",
    source: { label: "Standard Webhooks specification", href: "https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md" },
  },
  stripe: {
    retries: "Up to three days with exponential backoff in live mode; three times over a few hours in a sandbox.",
    deadline: "Not stated. Stripe asks for a quick 2xx before any slow work.",
    source: { label: "Stripe: Receive events in your webhook endpoint", href: "https://docs.stripe.com/webhooks" },
  },
  github: {
    retries: "None. Failed deliveries must be redelivered by hand or through the REST API.",
    deadline: "10 seconds.",
    source: { label: "GitHub: Handling failed webhook deliveries", href: "https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries" },
  },
  shopify: {
    retries: "Up to eight times over four hours. The subscription is removed if failures persist.",
    deadline: "5 seconds.",
    source: { label: "Shopify: Troubleshooting webhooks", href: "https://shopify.dev/docs/apps/build/webhooks/troubleshooting-webhooks" },
  },
  slack: {
    retries: "Up to three retries: almost immediately, after 1 minute, and after 5 minutes.",
    deadline: "3 seconds.",
    source: { label: "Slack: Events API", href: "https://docs.slack.dev/apis/events-api/" },
  },
};

function keyHandling(adapter: Adapter) {
  const secret = adapter.fields.find((field) => field.name === "secret")?.label ?? "Secret";
  return adapter.textKey ? `${secret}, used as text` : `${secret}, with the whsec_ prefix removed and the rest Base64-decoded`;
}

function tolerance(adapter: Adapter) {
  if (!adapter.tolerance) return "None. No timestamp is signed, so a signature never expires.";
  return `${adapter.tolerance.seconds / 60} minutes, using ${adapter.tolerance.label}`;
}

function providerRow(id: ProviderId): ComparisonRow {
  const adapter = adapters[id];
  const { tolerance: policyTolerance, ...policy } = policies[id];
  return {
    name: adapter.name,
    verifier: verifierContents.find((content) => content.provider === id)?.path,
    headers: adapter.fields.filter((field) => field.name !== "secret").map((field) => field.label),
    message: adapter.formula,
    encoding: adapter.encoding === "hex" ? "Hex" : "Base64",
    key: keyHandling(adapter),
    tolerance: policyTolerance ?? tolerance(adapter),
    ...policy,
  };
}

// Cascadehook signs with Standard Webhooks; the limits mirror
// deliveries/lease.go and delivery/outcome.go in apps/server.
const cascadehookRow: ComparisonRow = {
  ...providerRow("standard-webhooks"),
  name: "Cascadehook",
  tolerance: "5 minutes in the reference receivers.",
  retries: "Up to 8 attempts within 72 hours, with jittered backoff from about 15 seconds to 18 hours. 408, 429, 5xx, timeouts, and network errors are retried; Retry-After can lengthen a wait.",
  deadline: "30 seconds per attempt.",
  source: { label: "Cascadehook: Deliveries, retries, and replay", href: siteURL + "/docs/concepts/deliveries" },
};

export const comparisonRows = [...(Object.keys(policies) as ProviderId[]).map(providerRow), cascadehookRow];

export const comparisonSummary =
  "Every scheme here signs with HMAC-SHA256. They differ in what is signed, how the signature is encoded, how the secret becomes the HMAC key, whether a timestamp limits replays, and how the sender retries failed deliveries.";

export const comparisonNotes = [
  "GitHub and Shopify sign only the body, so a captured request keeps a valid signature indefinitely. Deduplicate on the provider's delivery or event ID to resist replays.",
  "Stripe, Slack, and Standard Webhooks sign a timestamp with the body, so receivers can reject old requests. Keep the server clock synced with NTP.",
  "Standard Webhooks also signs the message ID, which doubles as an idempotency key for the receiver.",
  "Standard Webhooks decodes its whsec_ secret from Base64, while Stripe uses its whsec_ secret as text. Treating one like the other is a common cause of mismatches.",
  "Response deadlines range from 3 to 30 seconds. Acknowledge quickly and move slow work to a queue.",
];

function cell(text: string) {
  return text.replace(/\|/g, "\\|");
}

export function comparisonMarkdown() {
  const signing = comparisonRows.map((row) =>
    `| ${row.name} | ${row.headers.map((header) => "`" + header + "`").join(", ")} | \`${cell(row.message)}\` | ${row.encoding} | ${cell(row.key)} | ${cell(row.tolerance)} |`,
  );
  const delivery = comparisonRows.map((row) => `| ${row.name} | ${cell(row.retries)} | ${cell(row.deadline)} | [${row.source.label}](${row.source.href}) |`);
  const verifiers = comparisonRows
    .filter((row) => row.verifier && row.name !== "Cascadehook")
    .map((row) => `- [${row.name} verifier](${siteURL}${row.verifier}.md)`);
  return [
    "# Webhook signature schemes compared",
    comparisonSummary,
    "## How each request is signed",
    "| Scheme | Headers | Signed message | Encoding | Key | Timestamp tolerance |\n| --- | --- | --- | --- | --- | --- |\n" + signing.join("\n"),
    "## Retries and response deadlines",
    "| Sender | Automatic retries | Response deadline | Source |\n| --- | --- | --- | --- |\n" + delivery.join("\n"),
    "## What the differences mean",
    comparisonNotes.map((note) => "- " + note).join("\n"),
    "## Verifiers",
    verifiers.join("\n"),
    `Policies were checked against each provider's documentation on ${comparisonChecked}.`,
  ].join("\n\n");
}
