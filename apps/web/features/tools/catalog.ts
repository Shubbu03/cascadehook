// Add new tools here; the sitemap and the Markdown index read this list.
// Bump `updated` when a page's content changes.
export const tools = [
  {
    href: "/tools/webhook-signature-verifier",
    title: "Webhook signature verifier",
    description: "Check a Standard Webhooks signature and find out why it fails: a re-encoded body, the wrong key encoding, a stale timestamp, and more.",
    tags: ["Standard Webhooks", "HMAC-SHA256", "Runs in your browser"],
    updated: "2026-11-05",
  },
  {
    href: "/tools/stripe-webhook-signature-verifier",
    title: "Stripe webhook signature verifier",
    description: "Check a Stripe-Signature header and find out why it fails: a parsed body, the wrong endpoint secret, test vs live mode, and more.",
    tags: ["Stripe", "Stripe-Signature", "Runs in your browser"],
    updated: "2026-11-05",
  },
  {
    href: "/tools/github-webhook-signature-verifier",
    title: "GitHub webhook signature verifier",
    description: "Check X-Hub-Signature-256 against your webhook secret, including legacy SHA-1 signatures and form-encoded payloads.",
    tags: ["GitHub", "X-Hub-Signature-256", "Runs in your browser"],
    updated: "2026-11-05",
  },
  {
    href: "/tools/shopify-webhook-hmac-verifier",
    title: "Shopify webhook HMAC verifier",
    description: "Check X-Shopify-Hmac-Sha256 against your app's client secret and find out why the HMAC doesn't match.",
    tags: ["Shopify", "HMAC-SHA256", "Runs in your browser"],
    updated: "2026-11-05",
  },
  {
    href: "/tools/slack-request-signature-verifier",
    title: "Slack request signature verifier",
    description: "Check X-Slack-Signature for slash commands, interactivity, and Events API requests, form-encoded bodies included.",
    tags: ["Slack", "X-Slack-Signature", "Runs in your browser"],
    updated: "2026-11-05",
  },
] as const;

export const references = [
  {
    href: "/tools/webhook-signature-comparison",
    title: "Webhook signature schemes compared",
    description: "Headers, signed message, key handling, timestamp tolerance, and retry policy for Standard Webhooks, Stripe, GitHub, Shopify, Slack, and Cascadehook.",
    updated: "2026-11-07",
  },
] as const;

export const toolsIndexUpdated = "2026-11-07";
