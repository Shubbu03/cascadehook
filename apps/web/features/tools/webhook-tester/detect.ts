import type { Adapter, ProviderId, VerifierInput } from "../verifier/core";

export function headerMap(headers: [string, string][]) {
  const map = new Map<string, string>();
  for (const [name, value] of headers) {
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, value);
  }
  return map;
}

const rules: { provider: ProviderId; headers: string[] }[] = [
  { provider: "stripe", headers: ["stripe-signature"] },
  { provider: "shopify", headers: ["x-shopify-hmac-sha256"] },
  { provider: "slack", headers: ["x-slack-signature"] },
  { provider: "github", headers: ["x-hub-signature-256", "x-hub-signature"] },
  // Svix sends Standard Webhooks under svix-* header names.
  { provider: "standard-webhooks", headers: ["webhook-signature", "svix-signature"] },
];

export const detectedHeaders = rules.flatMap((rule) => rule.headers);

export function detectProvider(headers: Map<string, string>): ProviderId | null {
  return rules.find((rule) => rule.headers.some((name) => headers.has(name)))?.provider ?? null;
}

const aliases: Record<string, string> = {
  "webhook-id": "svix-id",
  "webhook-timestamp": "svix-timestamp",
  "webhook-signature": "svix-signature",
};

export function buildInput(adapter: Adapter, headers: Map<string, string>, body: string, secret: string): VerifierInput {
  const input: VerifierInput = { secret, id: "", timestamp: "", signature: "", body, computed: "" };
  for (const field of adapter.fields) {
    if (field.headers.length === 0) continue;
    const names = field.headers.flatMap((name) => (aliases[name] ? [name, aliases[name]] : [name]));
    const found = names.find((name) => headers.has(name));
    if (found) input[field.name] = headers.get(found)!;
  }
  return input;
}
