import {
  bodyVariants,
  bytesToHex,
  encoder,
  findBodyVariant,
  formEncodings,
  hmac,
  nowSeconds,
  parseJson,
  randomAlphanumeric,
  randomHex,
  type Adapter,
  type BodyVariant,
  type Entry,
  type VerifierInput,
} from "../core";

function parse(input: VerifierInput): Entry[] {
  const match = /^(v\d+)=(.*)$/.exec(input.signature);
  return [match ? { scheme: match[1], value: match[2] } : { scheme: null, value: input.signature }];
}

const token = /^(xox[a-z]|xapp)-/;

function formVariants(body: string) {
  const variants: BodyVariant[] = [];
  const add = (candidates: string[], title: string, detail: string) => {
    for (const candidate of candidates) variants.push({ body: candidate, title, detail, change: "" });
  };
  const parsed = parseJson(body);
  if (parsed !== undefined) {
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const fields = Object.entries(parsed);
      if (fields.every(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
        add(formEncodings(fields.map(([name, value]) => [name, String(value)])), "The form body was converted to JSON",
          "The signature matches these fields sent as form data. Slash commands and other Slack requests arrive as application/x-www-form-urlencoded, and Slack signs those raw form bytes. Your framework parsed the form; verify the raw body before it does.");
      }
    }
    add(formEncodings([["payload", body]]), "The payload was taken out of the form body",
      "The signature matches this JSON sent as payload=… form data, which is how Slack delivers interactivity requests. Verify the raw form body before reading the payload field.");
  } else if (body.includes("=")) {
    const pairs = body.split("&").map((pair): [string, string] => {
      const equals = pair.indexOf("=");
      return equals === -1 ? [pair, ""] : [pair.slice(0, equals), pair.slice(equals + 1)];
    });
    add(formEncodings(pairs), "The form body was URL-decoded",
      "The signature matches once the values are percent-encoded again. Slack signs the raw form body with its %2F-style escapes still in it, so verify the body exactly as it arrived, before decoding.");
  }
  return variants;
}

export const slack: Adapter = {
  id: "slack",
  name: "Slack",
  fields: [
    { name: "secret", label: "Signing secret", placeholder: "From your app's Basic Information page", wide: true, headers: [] },
    { name: "timestamp", label: "X-Slack-Request-Timestamp", placeholder: "1531420618", wide: true, headers: ["x-slack-request-timestamp"] },
    { name: "signature", label: "X-Slack-Signature", placeholder: "v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503", wide: true, headers: ["x-slack-signature"] },
  ],
  bodyPlaceholder: "token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&command=%2Fweather&text=…",
  emptyState: "Paste your app's signing secret, the two X-Slack headers, and the raw body from a request, then verify.",
  formula: "HMAC-SHA256(secret, \"v0:\" + timestamp + \":\" + body)",
  expectedLabel: "Expected X-Slack-Signature",
  encoding: "hex",
  textKey: true,
  tolerance: { label: "X-Slack-Request-Timestamp", seconds: 5 * 60 },
  commonCauses: [
    "The signing secret belongs to a different app, or it was regenerated.",
    "The body isn't the raw bytes Slack sent. Slash commands and interactivity send form-encoded bodies (token=…&team_id=…), and those exact bytes are signed.",
    "The timestamp header comes from a different request than the signature.",
  ],

  validate(input) {
    const problems: string[] = [];
    if (!input.secret) problems.push("Enter your app's signing secret.");
    else if (token.test(input.secret)) problems.push("That's a Slack token, not the signing secret. Copy the Signing Secret from your app's Basic Information page.");
    if (!input.timestamp) problems.push("Enter the X-Slack-Request-Timestamp header value.");
    else if (!/^\d{1,16}$/.test(input.timestamp)) problems.push("X-Slack-Request-Timestamp must be a whole number of seconds since the Unix epoch.");
    if (!input.signature) problems.push("Enter the X-Slack-Signature header value.");
    else if (!/^v0=[0-9a-f]{64}$/i.test(input.signature)) problems.push("X-Slack-Signature should be v0= followed by 64 hex characters.");
    return problems;
  },
  timestamp: (input) => input.timestamp,
  parse,
  sign(input, options = {}) {
    const key = options.key ?? encoder.encode(options.secret ?? input.secret);
    return hmac(key, encoder.encode(`v0:${options.timestamp ?? input.timestamp}:${options.body ?? input.body}`));
  },
  accepts: (entry, value) => entry.scheme === "v0" && entry.value.toLowerCase() === value,
  expectedHeader: (_input, value) => "v0=" + value,
  signedPrefix: (input) => `v0:${input.timestamp}:`,
  keyNote: () => "HMAC-SHA256 over these bytes, keyed with the signing secret as UTF-8 text.",

  diagnose: (context) => findBodyVariant(context, slack, [...bodyVariants(context.input.body), ...formVariants(context.input.body)]),

  hints(input) {
    if (/^[0-9a-f]{32}$/i.test(input.secret)) return [];
    return ["The secret you pasted doesn't look like a signing secret, which is 32 hex characters. The Verification Token on the same Basic Information page is a different, deprecated value."];
  },

  async codeMistakes(input) {
    const key = encoder.encode(input.secret);
    const sign = (message: string) => hmac(key, encoder.encode(message));
    return [
      { title: "Your code leaves out the v0: prefix", detail: "Slack's base string starts with the version: v0:timestamp:body. Your value matches timestamp:body.", mac: await sign(`${input.timestamp}:${input.body}`) },
      { title: "Your code joins the parts with periods", detail: "Slack joins the base string with colons, v0:timestamp:body. Your value matches the parts joined with periods.", mac: await sign(`v0.${input.timestamp}.${input.body}`) },
      { title: "Your code signs only the body", detail: "Slack signs v0:timestamp:body, not the body alone. Prefix the raw body with v0:, the X-Slack-Request-Timestamp value, and a colon.", mac: await sign(input.body) },
    ];
  },

  async sample() {
    const secret = randomHex(16);
    const timestamp = nowSeconds();
    const body = formEncodings([
      ["token", randomAlphanumeric(24)],
      ["team_id", "T0" + randomAlphanumeric(9).toUpperCase()],
      ["team_domain", "example"],
      ["channel_id", "C0" + randomAlphanumeric(9).toUpperCase()],
      ["channel_name", "deploys"],
      ["user_id", "U0" + randomAlphanumeric(9).toUpperCase()],
      ["user_name", "alex"],
      ["command", "/status"],
      ["text", "orders-service"],
      ["response_url", "https://hooks.slack.com/commands/T0EXAMPLE/1234567890/abcdef"],
    ])[0];
    const signature = "v0=" + bytesToHex(await hmac(encoder.encode(secret), encoder.encode(`v0:${timestamp}:${body}`)));
    return { secret, id: "", timestamp, signature, body, computed: "" };
  },
};
