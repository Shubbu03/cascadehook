// Add new tools here and to app/sitemap.ts.
export const tools = [
  {
    href: "/tools/webhook-signature-verifier",
    title: "Webhook signature verifier",
    description: "Check a Standard Webhooks signature and find out why it fails: a re-encoded body, the wrong key encoding, a stale timestamp, and more.",
    tags: ["Standard Webhooks", "HMAC-SHA256", "Runs in your browser"],
  },
  {
    href: "/tools/stripe-webhook-signature-verifier",
    title: "Stripe webhook signature verifier",
    description: "Check a Stripe-Signature header and find out why it fails: a parsed body, the wrong endpoint secret, test vs live mode, and more.",
    tags: ["Stripe", "Stripe-Signature", "Runs in your browser"],
  },
  {
    href: "/tools/github-webhook-signature-verifier",
    title: "GitHub webhook signature verifier",
    description: "Check X-Hub-Signature-256 against your webhook secret, including legacy SHA-1 signatures and form-encoded payloads.",
    tags: ["GitHub", "X-Hub-Signature-256", "Runs in your browser"],
  },
  {
    href: "/tools/shopify-webhook-hmac-verifier",
    title: "Shopify webhook HMAC verifier",
    description: "Check X-Shopify-Hmac-Sha256 against your app's client secret and find out why the HMAC doesn't match.",
    tags: ["Shopify", "HMAC-SHA256", "Runs in your browser"],
  },
  {
    href: "/tools/slack-request-signature-verifier",
    title: "Slack request signature verifier",
    description: "Check X-Slack-Signature for slash commands, interactivity, and Events API requests, form-encoded bodies included.",
    tags: ["Slack", "X-Slack-Signature", "Runs in your browser"],
  },
] as const;
