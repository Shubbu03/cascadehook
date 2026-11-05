// Public tools listed on /tools. Each tool is its own route under /tools so it
// can rank for its own searches; add new tools here and to the sitemap.
export const tools = [
  {
    href: "/tools/webhook-signature-verifier",
    title: "Webhook signature verifier",
    description: "Check a Standard Webhooks signature and find out why it fails: a re-encoded body, the wrong key encoding, a stale timestamp, and more.",
    tags: ["Standard Webhooks", "HMAC-SHA256", "Runs in your browser"],
  },
] as const;
