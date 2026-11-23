import {
  bodyVariants,
  bytesToHex,
  encoder,
  findBodyVariant,
  formEncodings,
  hmac,
  parseJson,
  randomHex,
  type Adapter,
  type Entry,
  type Hash,
  type VerifierInput,
} from "../core";

function parse(input: VerifierInput): Entry[] {
  const match = /^(sha256|sha1)=(.*)$/i.exec(input.signature);
  return [match ? { scheme: match[1].toLowerCase(), value: match[2] } : { scheme: null, value: input.signature }];
}

function hashFor(input: VerifierInput): Hash {
  const [entry] = parse(input);
  return entry.scheme === "sha1" || (entry.scheme === null && entry.value.length === 40) ? "SHA-1" : "SHA-256";
}

export const github: Adapter = {
  id: "github",
  name: "GitHub",
  fields: [
    { name: "secret", label: "Webhook secret", placeholder: "The secret set on the webhook", wide: true, headers: [] },
    { name: "signature", label: "X-Hub-Signature-256", placeholder: "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17", wide: true, headers: ["x-hub-signature-256", "x-hub-signature"] },
  ],
  bodyPlaceholder: '{"zen":"Design for failure.","hook_id":…}',
  emptyState: "Paste the webhook's secret, the X-Hub-Signature-256 header, and the raw payload from a delivery, then verify.",
  formula: "HMAC-SHA256(secret, body)",
  expectedLabel: "Expected X-Hub-Signature-256",
  encoding: "hex",
  textKey: true,
  commonCauses: [
    "The secret is for a different webhook. Repository, organization, and GitHub App webhooks each have their own secret.",
    "The body isn't the exact payload GitHub sent. Copy it from the raw request rather than a parsed object.",
    "The webhook's content type is application/x-www-form-urlencoded, so GitHub signed the form body (payload=…), not the JSON inside it.",
    "A proxy or load balancer in front of your server changed the body.",
  ],

  validate(input) {
    const problems: string[] = [];
    if (!input.secret) problems.push("Enter the webhook's secret.");
    if (!input.signature) {
      problems.push("Enter the X-Hub-Signature-256 header value.");
      return problems;
    }
    const [entry] = parse(input);
    const hexLength = hashFor(input) === "SHA-1" ? 40 : 64;
    if (!new RegExp(`^[0-9a-f]{${hexLength}}$`, "i").test(entry.value)) {
      problems.push(hexLength === 40
        ? "X-Hub-Signature should be sha1= followed by 40 hex characters."
        : "X-Hub-Signature-256 should be sha256= followed by 64 hex characters.");
    }
    return problems;
  },
  parse,
  sign(input, options = {}) {
    const key = options.key ?? encoder.encode(options.secret ?? input.secret);
    return hmac(key, encoder.encode(options.body ?? input.body), options.hash ?? hashFor(input));
  },
  accepts: (entry, value) => entry.value.toLowerCase() === value,
  expectedHeader: (input, value) => (hashFor(input) === "SHA-1" ? "sha1=" : "sha256=") + value,
  signedPrefix: () => "",
  keyNote: (input) => `${hashFor(input) === "SHA-1" ? "HMAC-SHA1" : "HMAC-SHA256"} of the raw body, keyed with the secret as UTF-8 text.`,

  notes(input) {
    const [entry] = parse(input);
    if (hashFor(input) === "SHA-1") {
      return [{ title: "This is the legacy SHA-1 signature", detail: "X-Hub-Signature uses HMAC-SHA1 and is sent only for compatibility. GitHub sends X-Hub-Signature-256 with every signed delivery; verify that one instead." }];
    }
    if (entry.scheme === null) {
      return [{ title: "Missing the sha256= prefix", detail: "The value was checked without a prefix. GitHub's header starts with sha256=, so if your code compares the whole header, it must add the prefix to the value it computes." }];
    }
    return [];
  },

  async diagnose(context) {
    const { input } = context;
    const variants = bodyVariants(input.body);
    if (parseJson(input.body) !== undefined) {
      for (const body of formEncodings([["payload", input.body]])) {
        variants.push({
          body,
          title: "GitHub signed the form-encoded body",
          detail: "The signature matches this JSON sent as payload=… form data. The webhook's content type is application/x-www-form-urlencoded, so GitHub signed the raw form body. Verify those bytes before reading the payload field, or switch the webhook's content type to application/json.",
          change: "",
        });
      }
    }
    return findBodyVariant(context, github, variants);
  },

  async codeMistakes(input) {
    const legacy = hashFor(input) === "SHA-1";
    return [{
      title: legacy ? "Your code uses SHA-256 for the legacy header" : "Your code uses SHA-1",
      detail: legacy
        ? "X-Hub-Signature is HMAC-SHA1. Your value is the HMAC-SHA256 that belongs in X-Hub-Signature-256, which is the header to verify."
        : "X-Hub-Signature-256 is HMAC-SHA256. Your value is HMAC-SHA1, which belongs to the legacy X-Hub-Signature header.",
      mac: await github.sign(input, { hash: legacy ? "SHA-256" : "SHA-1" }),
    }];
  },

  async sample() {
    const secret = randomHex(20);
    const body = JSON.stringify({
      zen: "Design for failure.",
      hook_id: 512340987,
      hook: { type: "Repository", id: 512340987, active: true, events: ["push", "pull_request"], config: { content_type: "json", insecure_ssl: "0" } },
      repository: { id: 791234567, name: "orders-service", full_name: "example-org/orders-service", private: true },
      sender: { login: "octo-dev", id: 1234567, type: "User" },
    });
    const signature = "sha256=" + bytesToHex(await hmac(encoder.encode(secret), encoder.encode(body)));
    return { secret, id: "", timestamp: "", signature, body, computed: "" };
  },
};
