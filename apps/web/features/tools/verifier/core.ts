// Runs only in the browser: pasted secrets and payloads are never sent, logged, or stored.

export type ProviderId = "standard-webhooks" | "stripe" | "github" | "shopify" | "slack";
export type FieldName = "secret" | "id" | "timestamp" | "signature";
export type Hash = "SHA-256" | "SHA-1";
export type Bytes = Uint8Array<ArrayBuffer>;
export type Finding = { title: string; detail: string };

export type VerifierInput = Record<FieldName | "body" | "computed", string>;

export const emptyInput: VerifierInput = { secret: "", id: "", timestamp: "", signature: "", body: "", computed: "" };

export type FieldSpec = {
  name: FieldName;
  label: string;
  placeholder: string;
  wide: boolean;
  headers: string[];
};

export type Entry = { scheme: string | null; value: string };

export type SignOptions = { secret?: string; key?: Bytes; body?: string; timestamp?: string; hash?: Hash };

export type DiagnoseContext = {
  input: VerifierInput;
  entries: Entry[];
  mac: Bytes;
  matches: (value: string) => boolean;
};

export type CodeMistake = Finding & { mac: Bytes };

export type Adapter = {
  id: ProviderId;
  name: string;
  fields: FieldSpec[];
  bodyPlaceholder: string;
  emptyState: string;
  formula: string;
  expectedLabel: string;
  encoding: "hex" | "base64";
  textKey: boolean;
  tolerance?: { label: string; seconds: number };
  commonCauses: string[];
  validate(input: VerifierInput): string[];
  timestamp?(input: VerifierInput): string;
  parse(input: VerifierInput): Entry[];
  sign(input: VerifierInput, options?: SignOptions): Promise<Bytes>;
  accepts(entry: Entry, value: string, input: VerifierInput): boolean;
  expectedHeader(input: VerifierInput, value: string): string;
  signedPrefix(input: VerifierInput): string;
  keyNote(input: VerifierInput): string;
  notes?(input: VerifierInput, entries: Entry[]): Finding[];
  diagnose(context: DiagnoseContext): Promise<Finding | undefined>;
  hints?(input: VerifierInput): string[];
  codeMistakes?(input: VerifierInput): Promise<CodeMistake[]>;
  sample(): Promise<VerifierInput>;
};

export type TimestampInfo = {
  label: string;
  toleranceSeconds: number;
  ageSeconds: number;
  withinTolerance: boolean;
  looksLikeMilliseconds: boolean;
};

export type ComputedCheck = { status: "correct" } | { status: "mistake"; mistake: Finding } | { status: "unknown" };

export type VerificationResult =
  | { status: "invalid-input"; problems: string[] }
  | {
      status: "valid" | "invalid";
      diagnosis?: Finding;
      hints: string[];
      notes: Finding[];
      timestamp?: TimestampInfo;
      matchedIndex?: number;
      signatureCount: number;
      expectedHeader: string;
      expectedLabel: string;
      signedPrefix: string;
      bodyBytes: number;
      keyNote: string;
      computed?: ComputedCheck;
    };

export const encoder = new TextEncoder();

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function base64ToBytes(value: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  try {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function hmac(key: Bytes, message: Bytes, hash: Hash = "SHA-256") {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, message));
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function randomHex(byteCount: number) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteCount)));
}

export function randomAlphanumeric(length: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  // Rejection sampling: 248 is the largest multiple of 62 below 256.
  let out = "";
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte < 248 && out.length < length) out += alphabet[byte % 62];
    }
  }
  return out;
}

export function nowSeconds() {
  return String(Math.floor(Date.now() / 1000));
}

export function cleanHeaderValue(value: string, name: string) {
  const trimmed = value.trim();
  const prefix = name.toLowerCase() + ":";
  return trimmed.toLowerCase().startsWith(prefix) ? trimmed.slice(prefix.length).trim() : trimmed;
}

export type BodyVariant = { body: string; title: string; detail: string; change: string };

export function bodyVariants(body: string) {
  const variants: BodyVariant[] = [];
  const add = (candidate: string, title: string, detail: string, change: string) => {
    if (candidate !== body && !variants.some((variant) => variant.body === candidate)) variants.push({ body: candidate, title, detail, change });
  };
  add(body.replace(/\s+$/, ""), "Extra whitespace at the end of the body",
    "The signature matches once trailing whitespace or a final newline is removed. The pasted body has characters that weren't in the request, which is common when copying from a terminal.",
    "with trailing whitespace removed");
  add(body + "\n", "Missing newline at the end of the body",
    "The signature matches when a final newline is added. The original request body ended with a newline that was lost along the way.",
    "with a newline added at the end");
  add(body.replace(/\r?\n/g, "\r\n"), "Line endings changed",
    "The signature matches with Windows (CRLF) line endings. The body was signed with \\r\\n line breaks, but the copy you're verifying uses \\n.",
    "with CRLF line endings");
  const parsed = parseJson(body);
  if (parsed !== undefined) {
    const reencoded = "The body you're verifying was re-encoded after it was received. This is the most common cause of failures: frameworks such as Express (express.json()), Flask (request.json), or Django REST parse the JSON, and serializing it again doesn't reproduce the exact bytes. Verify against the raw request body before parsing it.";
    add(JSON.stringify(parsed), "The JSON was reformatted", "The signature matches the compact form of this JSON. " + reencoded, "parsed and serialized again as compact JSON");
    add(JSON.stringify(parsed, null, 2), "The JSON was reformatted", "The signature matches this JSON indented with 2 spaces. " + reencoded, "parsed and serialized again with 2-space indentation");
    add(JSON.stringify(parsed, null, 4), "The JSON was reformatted", "The signature matches this JSON indented with 4 spaces. " + reencoded, "parsed and serialized again with 4-space indentation");
  }
  return variants;
}

export function formEncodings(pairs: [string, string][]) {
  const styles = [
    (value: string) => new URLSearchParams([["", value]]).toString().slice(1),
    (value: string) => encodeURIComponent(value).replace(/%20/g, "+"),
    (value: string) => encodeURIComponent(value),
  ];
  const encodings = styles.map((encode) => pairs.map(([name, value]) => encode(name) + "=" + encode(value)).join("&"));
  return [...new Set(encodings)];
}

export async function findBodyVariant(
  context: DiagnoseContext,
  adapter: Pick<Adapter, "sign" | "encoding">,
  variants: { body: string; title: string; detail: string }[],
): Promise<Finding | undefined> {
  for (const variant of variants) {
    if (variant.body === context.input.body) continue;
    const candidate = encode(adapter, await adapter.sign(context.input, { body: variant.body }));
    if (context.matches(candidate)) return { title: variant.title, detail: variant.detail };
  }
  return undefined;
}

export function encode(adapter: Pick<Adapter, "encoding">, mac: Uint8Array) {
  return adapter.encoding === "hex" ? bytesToHex(mac) : bytesToBase64(mac);
}

function normalize(adapter: Adapter, raw: VerifierInput): VerifierInput {
  const input = { ...raw, secret: raw.secret.trim(), computed: raw.computed.trim() };
  for (const field of adapter.fields) {
    if (field.name === "secret") continue;
    input[field.name] = field.headers.reduce((value, header) => cleanHeaderValue(value, header), raw[field.name]);
  }
  return input;
}

export async function verify(adapter: Adapter, raw: VerifierInput): Promise<VerificationResult> {
  const input = normalize(adapter, raw);
  const problems = adapter.validate(input);
  if (problems.length > 0) return { status: "invalid-input", problems };

  const mac = await adapter.sign(input);
  const value = encode(adapter, mac);
  const entries = adapter.parse(input);
  const matches = (candidate: string) => entries.some((entry) => adapter.accepts(entry, candidate, input));

  const signedTimestamp = adapter.timestamp?.(input);
  let timestamp: TimestampInfo | undefined;
  if (adapter.tolerance && signedTimestamp) {
    const ageSeconds = Math.round(Date.now() / 1000 - Number(signedTimestamp));
    timestamp = {
      label: adapter.tolerance.label,
      toleranceSeconds: adapter.tolerance.seconds,
      ageSeconds,
      withinTolerance: Math.abs(ageSeconds) <= adapter.tolerance.seconds,
      looksLikeMilliseconds: signedTimestamp.length >= 13,
    };
  }

  const common = {
    timestamp,
    notes: adapter.notes?.(input, entries) ?? [],
    signatureCount: entries.length,
    expectedHeader: adapter.expectedHeader(input, value),
    expectedLabel: adapter.expectedLabel,
    signedPrefix: adapter.signedPrefix(input),
    bodyBytes: encoder.encode(input.body).length,
    keyNote: adapter.keyNote(input),
    computed: input.computed && adapter.codeMistakes ? await checkComputed(adapter, input, mac) : undefined,
  };

  const matchedIndex = entries.findIndex((entry) => adapter.accepts(entry, value, input));
  if (matchedIndex !== -1) return { status: "valid", matchedIndex, hints: [], ...common };

  const diagnosis = await adapter.diagnose({ input, entries, mac, matches });
  const hints = diagnosis ? [] : [...(adapter.hints?.(input) ?? []), ...adapter.commonCauses];
  return { status: "invalid", diagnosis, hints, ...common };
}

const encodingNames = { hex: "lowercase hex", base64: "standard Base64" };
const encodingFixes = {
  hex: "digest(\"hex\") in Node, hexdigest() in Python, or hex.EncodeToString in Go",
  base64: "digest(\"base64\") in Node, base64.b64encode in Python, or base64.StdEncoding.EncodeToString in Go",
};

function misencodings(adapter: Adapter, mac: Uint8Array) {
  const base64 = bytesToBase64(mac);
  const urlSafe = base64.replace(/\+/g, "-").replace(/\//g, "_");
  const hex = bytesToHex(mac);
  const all = [
    { value: hex, name: "hex" },
    { value: hex.toUpperCase(), name: "uppercase hex" },
    { value: base64, name: "Base64" },
    { value: urlSafe, name: "URL-safe Base64" },
    { value: urlSafe.replace(/=+$/, ""), name: "unpadded URL-safe Base64" },
  ];
  const expected = encode(adapter, mac);
  return all.filter((entry) => entry.value !== expected);
}

function stripScheme(value: string) {
  return value.replace(/^(sha256|sha1|v0|v1)[=,]/i, "");
}

async function checkComputed(adapter: Adapter, input: VerifierInput, mac: Bytes): Promise<ComputedCheck> {
  const given = stripScheme(input.computed);
  const expected = encode(adapter, mac);
  if (given === expected) return { status: "correct" };

  const right = encodingNames[adapter.encoding];
  const wrongEncoding = misencodings(adapter, mac).find((entry) => entry.value === given);
  if (wrongEncoding) {
    return {
      status: "mistake",
      mistake: {
        title: `Your code writes the HMAC as ${wrongEncoding.name}`,
        detail: `The HMAC itself is right, but ${adapter.name} sends it as ${right}, and comparing strings in different encodings always fails. Use ${encodingFixes[adapter.encoding]}, or decode both values to bytes before comparing.`,
      },
    };
  }

  const mistakes: CodeMistake[] = [];
  if (adapter.textKey) {
    const message = (secret: string) => adapter.sign(input, { secret });
    mistakes.push(
      { title: "Your secret has a trailing newline", detail: "Your value matches the secret with a newline at the end, which usually comes from reading it out of a file or an .env value. Trim the secret before using it as the key.", mac: await message(input.secret + "\n") },
      { title: "Your secret still has quotes around it", detail: "Your value matches the secret wrapped in double quotes, which happens when an .env loader keeps them. Remove the quotes from the value your code loads.", mac: await message(`"${input.secret}"`) },
    );
  }
  mistakes.push(...await adapter.codeMistakes!(input));
  for (const variant of bodyVariants(input.body)) {
    mistakes.push({
      title: "Your code signs a different body",
      detail: `Your value matches the body ${variant.change}. Your code is hashing something other than the exact bytes ${adapter.name} sent. Read the raw request body and verify it before any parsing.`,
      mac: await adapter.sign(input, { body: variant.body }),
    });
  }

  for (const mistake of mistakes) {
    if (encode(adapter, mistake.mac) === given) return { status: "mistake", mistake: { title: mistake.title, detail: mistake.detail } };
    const also = misencodings(adapter, mistake.mac).find((entry) => entry.value === given);
    if (also) {
      return { status: "mistake", mistake: { title: mistake.title, detail: `${mistake.detail} It's also written as ${also.name} instead of ${right}.` } };
    }
  }
  return { status: "unknown" };
}

export function parseHeaderBlock(text: string) {
  const headers = new Map<string, string>();
  const trimmed = text.trim();
  const parsed = trimmed.startsWith("{") ? parseJson(trimmed) : undefined;
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const source = record.headers && typeof record.headers === "object" ? record.headers as Record<string, unknown> : record;
    for (const [name, value] of Object.entries(source)) {
      const first = Array.isArray(value) ? value[0] : value;
      if (typeof first === "string" && !headers.has(name.toLowerCase())) headers.set(name.toLowerCase(), first.trim());
    }
    return headers;
  }
  let started = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*[<>]\s?/, "").trim();
    if (!line) {
      if (started) break;
      continue;
    }
    const match = /^([A-Za-z0-9-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    started = true;
    const name = match[1].toLowerCase();
    if (!headers.has(name)) headers.set(name, match[2].trim());
  }
  return headers;
}
