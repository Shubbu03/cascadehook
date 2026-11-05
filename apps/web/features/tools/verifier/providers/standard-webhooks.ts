import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  encoder,
  findBodyVariant,
  bodyVariants,
  hmac,
  nowSeconds,
  type Adapter,
  type Bytes,
  type Entry,
  type VerifierInput,
} from "../core";

function secretKey(secret: string) {
  return base64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
}

function signedMessage(id: string, timestamp: string, body: string) {
  return encoder.encode(id + "." + timestamp + "." + body);
}

function parse(input: VerifierInput): Entry[] {
  return input.signature.trim().split(/\s+/).filter(Boolean).map((entry) => {
    const comma = entry.indexOf(",");
    return comma === -1
      ? { scheme: null, value: entry }
      : { scheme: entry.slice(0, comma), value: entry.slice(comma + 1) };
  });
}

export const standardWebhooks: Adapter = {
  id: "standard-webhooks",
  name: "Standard Webhooks",
  fields: [
    { name: "secret", label: "Signing secret", placeholder: "whsec_…", wide: true, headers: [] },
    { name: "id", label: "Webhook-Id", placeholder: "0196f2c4-8a1e-7c3b-9d2f-…", wide: false, headers: ["webhook-id"] },
    { name: "timestamp", label: "Webhook-Timestamp", placeholder: "1767225600", wide: false, headers: ["webhook-timestamp"] },
    { name: "signature", label: "Webhook-Signature", placeholder: "v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=", wide: true, headers: ["webhook-signature"] },
  ],
  bodyPlaceholder: '{"type":"invoice.paid","data":{…}}',
  emptyState: "Paste the secret, the three headers, and the raw body from a request, then verify.",
  formula: "HMAC-SHA256(key, id + \".\" + timestamp + \".\" + body)",
  expectedLabel: "Expected Webhook-Signature",
  encoding: "base64",
  textKey: false,
  tolerance: { label: "Webhook-Timestamp", seconds: 5 * 60 },
  commonCauses: [
    "The secret belongs to a different endpoint, or it was rotated and you have the old one.",
    "The body isn't the exact raw bytes that were sent. Copy it from the raw request, not a parsed or pretty-printed view.",
    "The Webhook-Id or Webhook-Timestamp came from a different delivery attempt than the signature.",
  ],

  validate(input) {
    const problems: string[] = [];
    if (!input.secret) problems.push("Enter the endpoint's signing secret.");
    else if (!secretKey(input.secret)) problems.push("The signing secret isn't valid Base64. It should look like whsec_ followed by Base64 text.");
    if (!input.id) problems.push("Enter the Webhook-Id header value.");
    if (!input.timestamp) problems.push("Enter the Webhook-Timestamp header value.");
    else if (!/^\d{1,16}$/.test(input.timestamp)) problems.push("Webhook-Timestamp must be a whole number of seconds since the Unix epoch.");
    if (!input.signature) problems.push("Enter the Webhook-Signature header value.");
    return problems;
  },
  timestamp: (input) => input.timestamp,
  parse,
  sign(input, options = {}) {
    const key = options.key ?? secretKey(options.secret ?? input.secret)!;
    return hmac(key, signedMessage(input.id, options.timestamp ?? input.timestamp, options.body ?? input.body));
  },
  accepts: (entry, value) => entry.scheme === "v1" && entry.value === value,
  expectedHeader: (_input, value) => "v1," + value,
  signedPrefix: (input) => input.id + "." + input.timestamp + ".",
  keyNote: () => "HMAC-SHA256 over these bytes, keyed with the Base64-decoded secret (without whsec_).",

  async diagnose({ input, entries, mac, matches }) {
    const values = entries.map((entry) => entry.value);
    const expectedValue = bytesToBase64(mac);

    if (entries.some((entry) => entry.scheme === null && entry.value === expectedValue)) {
      return { title: "Missing the v1, prefix", detail: "The signature is correct, but each entry in Webhook-Signature must start with v1, followed by the Base64 signature." };
    }
    if (values.some((value) => value === bytesToHex(mac))) {
      return { title: "Signature is hex-encoded", detail: "The HMAC is correct, but it's written as hex. Standard Webhooks signatures are standard Base64 (with + / and = padding)." };
    }
    if (values.some((value) => value.replace(/-/g, "+").replace(/_/g, "/") === expectedValue)) {
      return { title: "Signature uses URL-safe Base64", detail: "The HMAC is correct, but it's encoded with URL-safe Base64 (- and _). Use standard Base64 (+ and /) instead." };
    }

    const withoutPrefix = input.secret.startsWith("whsec_") ? input.secret.slice(6) : input.secret;
    const keyMistakes = [
      { key: encoder.encode(input.secret), title: "Signed with the secret text instead of its key" },
      { key: encoder.encode(withoutPrefix), title: "Signed with the Base64 text instead of the decoded key" },
    ];
    for (const mistake of keyMistakes) {
      const candidate = bytesToBase64(await standardWebhooks.sign(input, { key: mistake.key }));
      if (matches(candidate) || values.includes(candidate)) {
        return {
          title: mistake.title,
          detail: "The signature was made with the secret string's characters as the HMAC key. Remove the whsec_ prefix and Base64-decode the rest; the decoded bytes are the key.",
        };
      }
    }

    const bodyFinding = await findBodyVariant({ input, entries, mac, matches }, standardWebhooks, bodyVariants(input.body));
    if (bodyFinding) return bodyFinding;

    if (input.timestamp.length >= 13) {
      const candidate = bytesToBase64(await standardWebhooks.sign(input, { timestamp: input.timestamp.slice(0, -3) }));
      if (matches(candidate)) {
        return { title: "Timestamp is in milliseconds", detail: "The signature matches when the timestamp is in seconds. Webhook-Timestamp must be Unix seconds, not milliseconds." };
      }
    }
    return undefined;
  },

  async sample() {
    const key: Bytes = crypto.getRandomValues(new Uint8Array(32));
    const id = crypto.randomUUID();
    const timestamp = nowSeconds();
    const body = JSON.stringify({ type: "invoice.paid", data: { invoice_id: "inv_1042", amount: 4900, currency: "usd" } });
    const signature = "v1," + bytesToBase64(await hmac(key, signedMessage(id, timestamp, body)));
    return { secret: "whsec_" + bytesToBase64(key), id, timestamp, signature, body, computed: "" };
  },
};
