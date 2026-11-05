import {
  base64ToBytes,
  bodyVariants,
  bytesToHex,
  encoder,
  findBodyVariant,
  hmac,
  nowSeconds,
  parseJson,
  randomAlphanumeric,
  type Adapter,
  type CodeMistake,
  type Entry,
  type VerifierInput,
} from "../core";

function headerItems(header: string) {
  return header.split(",").map((item) => {
    const equals = item.indexOf("=");
    return equals === -1 ? { key: item.trim(), value: "" } : { key: item.slice(0, equals).trim(), value: item.slice(equals + 1).trim() };
  });
}

function headerTimestamp(input: VerifierInput) {
  return headerItems(input.signature).find((item) => item.key === "t")?.value ?? "";
}

const apiKey = /^(sk|rk|pk)_(test|live)_/;

export const stripe: Adapter = {
  id: "stripe",
  name: "Stripe",
  fields: [
    { name: "secret", label: "Endpoint signing secret", placeholder: "whsec_…", wide: true, headers: [] },
    { name: "signature", label: "Stripe-Signature", placeholder: "t=1767225600,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd", wide: true, headers: ["stripe-signature"] },
  ],
  bodyPlaceholder: '{\n  "id": "evt_…",\n  "object": "event",\n  …\n}',
  emptyState: "Paste the endpoint's signing secret, the Stripe-Signature header, and the raw body from a request, then verify.",
  formula: "HMAC-SHA256(secret, t + \".\" + body)",
  expectedLabel: "Expected Stripe-Signature",
  encoding: "hex",
  textKey: true,
  tolerance: { label: "t= timestamp", seconds: 5 * 60 },
  commonCauses: [
    "The secret belongs to a different endpoint. Every endpoint has its own secret, and the one stripe listen prints is different from the Dashboard endpoint's.",
    "The body isn't the exact raw bytes Stripe sent. Copy it from the raw request, not from a parsed object or the event shown in the Dashboard.",
    "The header and the body come from different events.",
    "The secret was rolled. While the old one is still active Stripe sends a v1 for each secret, and after it expires only the new secret works.",
  ],

  validate(input) {
    const problems: string[] = [];
    if (!input.secret) problems.push("Enter the endpoint's signing secret.");
    else if (apiKey.test(input.secret)) problems.push("That's a Stripe API key, not a webhook signing secret. Use the endpoint's signing secret, which starts with whsec_. It's on the endpoint's page in Workbench, or printed by stripe listen.");
    if (!input.signature) {
      problems.push("Enter the Stripe-Signature header value.");
      return problems;
    }
    const items = headerItems(input.signature);
    const timestamp = items.find((item) => item.key === "t");
    if (!timestamp) problems.push("The Stripe-Signature header has no t= timestamp. Paste the whole header value, such as t=1767225600,v1=5257a8….");
    else if (!/^\d{1,16}$/.test(timestamp.value)) problems.push("The t= value must be a whole number of seconds since the Unix epoch.");
    if (timestamp && !items.some((item) => item.key === "v1")) {
      problems.push(items.some((item) => item.key === "v0")
        ? "The header has only a v0 signature. v0 is a placeholder Stripe adds to test events; the real signature is the v1 entry, so paste the whole header."
        : "The Stripe-Signature header has no v1= signature. Paste the whole header value.");
    }
    return problems;
  },
  timestamp: headerTimestamp,
  // Only v1 counts: v0 is a test-event placeholder, and other schemes allow downgrades.
  parse: (input): Entry[] => headerItems(input.signature).filter((item) => item.key === "v1").map((item) => ({ scheme: "v1", value: item.value })),
  sign(input, options = {}) {
    const key = options.key ?? encoder.encode(options.secret ?? input.secret);
    const timestamp = options.timestamp ?? headerTimestamp(input);
    return hmac(key, encoder.encode(timestamp + "." + (options.body ?? input.body)));
  },
  accepts: (entry, value) => entry.value.toLowerCase() === value,
  expectedHeader: (input, value) => `t=${headerTimestamp(input)},v1=${value}`,
  signedPrefix: (input) => headerTimestamp(input) + ".",
  keyNote: () => "HMAC-SHA256 over these bytes, keyed with the whole signing secret as text, whsec_ included.",

  async diagnose(context) {
    const { input, matches } = context;
    if (!input.secret.startsWith("whsec_")) {
      const candidate = bytesToHex(await stripe.sign(input, { secret: "whsec_" + input.secret }));
      if (matches(candidate)) {
        return {
          title: "The secret is missing its whsec_ prefix",
          detail: "The signature matches once whsec_ is added back. Stripe uses the entire secret, prefix included, as the HMAC key, so keep whsec_ in the value your code loads.",
        };
      }
    }
    return findBodyVariant(context, stripe, bodyVariants(input.body));
  },

  hints(input) {
    const livemode = (parseJson(input.body) as { livemode?: unknown } | undefined)?.livemode;
    if (livemode === false) return ["This event has \"livemode\": false, so it was signed with the secret of a sandbox or test-mode endpoint. Test and live endpoints never share a secret."];
    if (livemode === true) return ["This event has \"livemode\": true, so it was signed with a live-mode endpoint's secret, not a sandbox or test-mode one."];
    return [];
  },

  async codeMistakes(input) {
    const mistakes: CodeMistake[] = [];
    if (input.secret.startsWith("whsec_")) {
      const decoded = base64ToBytes(input.secret.slice(6));
      if (decoded) {
        mistakes.push({
          title: "Your code Base64-decodes the secret",
          detail: "Stripe uses the whole whsec_… string as text for the HMAC key. Don't strip whsec_ or Base64-decode the rest; that's how Standard Webhooks secrets work, not Stripe's.",
          mac: await stripe.sign(input, { key: decoded }),
        });
      }
      mistakes.push({
        title: "Your code strips the whsec_ prefix",
        detail: "Stripe's HMAC key is the entire secret, whsec_ included. Pass the secret exactly as Stripe shows it.",
        mac: await stripe.sign(input, { secret: input.secret.slice(6) }),
      });
    }
    mistakes.push({
      title: "Your code signs only the body",
      detail: "Stripe signs the t= timestamp, a period, and then the raw body: t + \".\" + body. Your value matches the body alone.",
      mac: await hmac(encoder.encode(input.secret), encoder.encode(input.body)),
    });
    return mistakes;
  },

  async sample() {
    const secret = "whsec_" + randomAlphanumeric(32);
    const timestamp = nowSeconds();
    const body = JSON.stringify({
      id: "evt_" + randomAlphanumeric(24),
      object: "event",
      created: Number(timestamp),
      data: { object: { id: "pi_" + randomAlphanumeric(24), object: "payment_intent", amount: 4900, currency: "usd", status: "succeeded" } },
      livemode: false,
      type: "payment_intent.succeeded",
    }, null, 2);
    const signature = bytesToHex(await hmac(encoder.encode(secret), encoder.encode(timestamp + "." + body)));
    return { secret, id: "", timestamp: "", signature: `t=${timestamp},v1=${signature}`, body, computed: "" };
  },
};
