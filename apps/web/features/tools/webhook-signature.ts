// Standard Webhooks signature checks for the public verifier tool. Everything
// runs through Web Crypto in the visitor's browser: secrets and payloads pasted
// into the page are never sent anywhere, logged, or written to storage.

export const timestampToleranceSeconds = 5 * 60;

export type VerificationInput = {
  secret: string;
  id: string;
  timestamp: string;
  signature: string;
  body: string;
};

export type VerificationResult =
  | { status: "invalid-input"; problems: string[] }
  | {
      status: "valid" | "invalid";
      // Why the signature failed, when one of the known mistakes reproduces it.
      diagnosis?: { title: string; detail: string };
      // The timestamp is reported separately: a correct signature with a stale
      // timestamp is still rejected by receivers that enforce the tolerance.
      timestamp: { ageSeconds: number; withinTolerance: boolean; looksLikeMilliseconds: boolean };
      matchedIndex?: number;
      signatureCount: number;
      expectedHeader: string;
      signedPrefix: string;
      bodyBytes: number;
    };

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(value: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  try {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

type Bytes = Uint8Array<ArrayBuffer>;

async function hmac(key: Bytes, message: Bytes) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, message));
}

function signedMessage(id: string, timestamp: string, body: string) {
  return encoder.encode(id + "." + timestamp + "." + body);
}

function secretKey(secret: string) {
  return base64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
}

// The header carries one or more space-separated "v1,<base64>" entries; two
// appear while a sender rotates secrets. Bare values are kept so the
// diagnosis can point out a missing version prefix.
function parseSignatures(header: string) {
  return header.trim().split(/\s+/).filter(Boolean).map((entry) => {
    const comma = entry.indexOf(",");
    return comma === -1
      ? { version: null, value: entry }
      : { version: entry.slice(0, comma), value: entry.slice(comma + 1) };
  });
}

function validate(input: VerificationInput) {
  const problems: string[] = [];
  if (!input.secret) problems.push("Enter the endpoint's signing secret.");
  else if (!secretKey(input.secret)) problems.push("The signing secret isn't valid Base64. It should look like whsec_ followed by Base64 text.");
  if (!input.id) problems.push("Enter the Webhook-Id header value.");
  if (!input.timestamp) problems.push("Enter the Webhook-Timestamp header value.");
  else if (!/^\d{1,16}$/.test(input.timestamp)) problems.push("Webhook-Timestamp must be a whole number of seconds since the Unix epoch.");
  if (!input.signature) problems.push("Enter the Webhook-Signature header value.");
  return problems;
}

// Copying a header value from a terminal or log often drags in the header name.
export function cleanHeaderValue(value: string, name: string) {
  const trimmed = value.trim();
  const prefix = name.toLowerCase() + ":";
  return trimmed.toLowerCase().startsWith(prefix) ? trimmed.slice(prefix.length).trim() : trimmed;
}

// Bodies that differ from what was signed in ways a framework, log viewer, or
// clipboard commonly introduces. Each is tried only when it actually differs.
function bodyVariants(body: string) {
  const variants: { body: string; title: string; detail: string }[] = [];
  const add = (candidate: string, title: string, detail: string) => {
    if (candidate !== body && !variants.some((variant) => variant.body === candidate)) variants.push({ body: candidate, title, detail });
  };
  add(body.replace(/\s+$/, ""), "Extra whitespace at the end of the body",
    "The signature matches once trailing whitespace or a final newline is removed. The pasted body has characters that weren't in the request, which is common when copying from a terminal.");
  add(body + "\n", "Missing newline at the end of the body",
    "The signature matches when a final newline is added. The original request body ended with a newline that was lost along the way.");
  add(body.replace(/\r?\n/g, "\r\n"), "Line endings changed",
    "The signature matches with Windows (CRLF) line endings. The body was signed with \\r\\n line breaks, but the copy you're verifying uses \\n.");
  try {
    const parsed: unknown = JSON.parse(body);
    const reencoded = "The body you're verifying was re-encoded after it was received. This is the most common cause of failures: frameworks such as Express (express.json()), Flask (request.json), or Django REST parse the JSON, and serializing it again doesn't reproduce the exact bytes. Verify against the raw request body before parsing it.";
    add(JSON.stringify(parsed), "The JSON was reformatted", "The signature matches the compact form of this JSON. " + reencoded);
    add(JSON.stringify(parsed, null, 2), "The JSON was reformatted", "The signature matches this JSON indented with 2 spaces. " + reencoded);
    add(JSON.stringify(parsed, null, 4), "The JSON was reformatted", "The signature matches this JSON indented with 4 spaces. " + reencoded);
  } catch {
    // Not JSON: only the whitespace variants apply.
  }
  return variants;
}

export async function verifySignature(raw: VerificationInput): Promise<VerificationResult> {
  const input: VerificationInput = {
    secret: raw.secret.trim(),
    id: cleanHeaderValue(raw.id, "webhook-id"),
    timestamp: cleanHeaderValue(raw.timestamp, "webhook-timestamp"),
    signature: cleanHeaderValue(raw.signature, "webhook-signature"),
    body: raw.body,
  };
  const problems = validate(input);
  if (problems.length > 0) return { status: "invalid-input", problems };

  const key = secretKey(input.secret)!;
  const expected = await hmac(key, signedMessage(input.id, input.timestamp, input.body));
  const expectedValue = bytesToBase64(expected);
  const signatures = parseSignatures(input.signature);

  const seconds = Number(input.timestamp);
  const looksLikeMilliseconds = input.timestamp.length >= 13;
  const ageSeconds = Math.round(Date.now() / 1000 - seconds);
  const common = {
    timestamp: { ageSeconds, withinTolerance: Math.abs(ageSeconds) <= timestampToleranceSeconds, looksLikeMilliseconds },
    signatureCount: signatures.length,
    expectedHeader: "v1," + expectedValue,
    signedPrefix: input.id + "." + input.timestamp + ".",
    bodyBytes: encoder.encode(input.body).length,
  };

  const matchedIndex = signatures.findIndex((entry) => entry.version === "v1" && entry.value === expectedValue);
  if (matchedIndex !== -1) return { status: "valid", matchedIndex, ...common };

  return { status: "invalid", diagnosis: await diagnose(input, key, expected, signatures), ...common };
}

async function diagnose(
  input: VerificationInput,
  key: Bytes,
  expected: Bytes,
  signatures: ReturnType<typeof parseSignatures>,
): Promise<{ title: string; detail: string } | undefined> {
  const values = signatures.map((entry) => entry.value);
  const v1Values = signatures.filter((entry) => entry.version === "v1").map((entry) => entry.value);
  const expectedValue = bytesToBase64(expected);

  if (signatures.some((entry) => entry.version === null && entry.value === expectedValue)) {
    return { title: "Missing the v1, prefix", detail: "The signature is correct, but each entry in Webhook-Signature must start with v1, followed by the Base64 signature." };
  }
  if (values.some((value) => value === bytesToHex(expected))) {
    return { title: "Signature is hex-encoded", detail: "The HMAC is correct, but it's written as hex. Standard Webhooks signatures are standard Base64 (with + / and = padding)." };
  }
  if (values.some((value) => value.replace(/-/g, "+").replace(/_/g, "/") === expectedValue)) {
    return { title: "Signature uses URL-safe Base64", detail: "The HMAC is correct, but it's encoded with URL-safe Base64 (- and _). Use standard Base64 (+ and /) instead." };
  }

  const message = signedMessage(input.id, input.timestamp, input.body);
  const withoutPrefix = input.secret.startsWith("whsec_") ? input.secret.slice(6) : input.secret;
  const keyMistakes = [
    { key: encoder.encode(input.secret), title: "Signed with the secret text instead of its key" },
    { key: encoder.encode(withoutPrefix), title: "Signed with the Base64 text instead of the decoded key" },
  ];
  for (const mistake of keyMistakes) {
    const candidate = bytesToBase64(await hmac(mistake.key, message));
    if (v1Values.includes(candidate) || values.includes(candidate)) {
      return {
        title: mistake.title,
        detail: "The signature was made with the secret string's characters as the HMAC key. Remove the whsec_ prefix and Base64-decode the rest; the decoded bytes are the key.",
      };
    }
  }

  for (const variant of bodyVariants(input.body)) {
    const candidate = bytesToBase64(await hmac(key, signedMessage(input.id, input.timestamp, variant.body)));
    if (v1Values.includes(candidate)) return { title: variant.title, detail: variant.detail };
  }

  if (input.timestamp.length >= 13) {
    const inSeconds = input.timestamp.slice(0, -3);
    const candidate = bytesToBase64(await hmac(key, signedMessage(input.id, inSeconds, input.body)));
    if (v1Values.includes(candidate)) {
      return { title: "Timestamp is in milliseconds", detail: "The signature matches when the timestamp is in seconds. Webhook-Timestamp must be Unix seconds, not milliseconds." };
    }
  }
  return undefined;
}

// A correctly signed example so visitors can try the tool without a real request.
export async function sampleInput(): Promise<VerificationInput> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const id = crypto.randomUUID();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: "invoice.paid", data: { invoice_id: "inv_1042", amount: 4900, currency: "usd" } });
  const signature = "v1," + bytesToBase64(await hmac(key, signedMessage(id, timestamp, body)));
  return { secret: "whsec_" + bytesToBase64(key), id, timestamp, signature, body };
}
