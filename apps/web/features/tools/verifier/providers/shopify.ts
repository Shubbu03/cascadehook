import {
  base64ToBytes,
  bodyVariants,
  bytesToBase64,
  encoder,
  findBodyVariant,
  hmac,
  randomHex,
  type Adapter,
  type CodeMistake,
} from "../core";

const accessToken = /^shp(at|ca|pa|ua)_/;

export const shopify: Adapter = {
  id: "shopify",
  name: "Shopify",
  fields: [
    { name: "secret", label: "App client secret", placeholder: "Your app's client secret", wide: true, headers: [] },
    { name: "signature", label: "X-Shopify-Hmac-Sha256", placeholder: "XWmrwMey6OsLMeiZKwP4FppHH3cmAiiJJAweH5Jo4bM=", wide: true, headers: ["x-shopify-hmac-sha256"] },
  ],
  bodyPlaceholder: '{"id":5683195347042,"email":"jon@example.com",…}',
  emptyState: "Paste your app's client secret, the X-Shopify-Hmac-Sha256 header, and the raw body from a delivery, then verify.",
  formula: "Base64(HMAC-SHA256(client secret, body))",
  expectedLabel: "Expected X-Shopify-Hmac-Sha256",
  encoding: "base64",
  textKey: true,
  commonCauses: [
    "The secret isn't the app's client secret. App webhooks are signed with the client secret from the app's settings, not the API key or an access token.",
    "The webhook was created in the store admin (Settings → Notifications) rather than by an app. Those deliveries are reportedly signed with the key shown on that page instead of an app's client secret.",
    "The client secret was rotated recently. Shopify can take up to an hour to start signing with the new one.",
    "The body isn't the exact raw bytes Shopify sent. Copy it from the raw request, not from a parsed object.",
  ],

  validate(input) {
    const problems: string[] = [];
    if (!input.secret) problems.push("Enter your app's client secret.");
    else if (accessToken.test(input.secret)) problems.push("That's a Shopify access token, not the app's client secret. Use the client secret from your app's settings, next to the client ID.");
    if (!input.signature) problems.push("Enter the X-Shopify-Hmac-Sha256 header value.");
    else if (/^[0-9a-f]{64}$/i.test(input.signature)) problems.push("That value is hex. Shopify sends X-Shopify-Hmac-Sha256 as Base64: 44 characters ending in =. If this is a value your code computed, paste it into \"Signature your code computed\" instead.");
    else if (!base64ToBytes(input.signature)) problems.push("X-Shopify-Hmac-Sha256 should be Base64: 44 characters ending in =.");
    return problems;
  },
  parse: (input) => [{ scheme: null, value: input.signature }],
  sign(input, options = {}) {
    const key = options.key ?? encoder.encode(options.secret ?? input.secret);
    return hmac(key, encoder.encode(options.body ?? input.body));
  },
  accepts: (entry, value) => entry.value === value,
  expectedHeader: (_input, value) => value,
  signedPrefix: () => "",
  keyNote: () => "HMAC-SHA256 of the raw body, keyed with the client secret as UTF-8 text, then Base64-encoded.",

  diagnose: (context) => findBodyVariant(context, shopify, bodyVariants(context.input.body)),

  async codeMistakes(input) {
    const mistakes: CodeMistake[] = [];
    const decoded = base64ToBytes(input.secret);
    if (decoded) {
      mistakes.push({
        title: "Your code Base64-decodes the secret",
        detail: "Shopify uses the client secret's text as the HMAC key. Pass the string as it is, without decoding it.",
        mac: await shopify.sign(input, { key: decoded }),
      });
    }
    return mistakes;
  },

  async sample() {
    const secret = randomHex(16);
    const body = JSON.stringify({
      id: 5683195347042,
      admin_graphql_api_id: "gid://shopify/Order/5683195347042",
      email: "jon@example.com",
      created_at: new Date().toISOString(),
      currency: "USD",
      total_price: "49.00",
      financial_status: "paid",
      line_items: [{ id: 13893456789012, title: "Example T-Shirt", quantity: 1, price: "49.00" }],
    });
    const signature = bytesToBase64(await hmac(encoder.encode(secret), encoder.encode(body)));
    return { secret, id: "", timestamp: "", signature, body, computed: "" };
  },
};
