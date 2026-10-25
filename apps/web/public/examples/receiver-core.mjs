import { createHmac, timingSafeEqual } from "node:crypto";
import { open } from "node:fs/promises";

export const MAX_BODY_BYTES = 256 * 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

class ReceiverError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function decodeSecret(secret) {
  if (
    typeof secret !== "string" ||
    !/^whsec_[A-Za-z0-9+/]{43}=$/.test(secret)
  ) {
    throw new Error(
      "Set CASCADEHOOK_SIGNING_SECRET to the endpoint's signing secret.",
    );
  }
  const key = Buffer.from(secret.slice(6), "base64");
  if (key.length !== 32 || key.toString("base64") !== secret.slice(6)) {
    throw new Error(
      "The signing secret must contain a canonical 32-byte Base64 key.",
    );
  }
  return key;
}

export function verifyWebhook(
  rawBody,
  headers,
  key,
  now = Math.floor(Date.now() / 1000),
) {
  const id = headers.get("webhook-id") ?? "";
  const timestamp = headers.get("webhook-timestamp") ?? "";
  const signatures = headers.get("webhook-signature") ?? "";
  if (
    !uuid.test(id) ||
    !/^(0|[1-9]\d{0,15})$/.test(timestamp) ||
    !signatures ||
    signatures.length > 512
  ) {
    throw new ReceiverError(400, "Malformed webhook headers.");
  }
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(now - seconds) > 300) {
    throw new ReceiverError(
      401,
      "Webhook timestamp is outside the five-minute tolerance.",
    );
  }
  const expected = createHmac("sha256", key)
    .update(id + "." + timestamp + ".")
    .update(rawBody)
    .digest();
  const valid = signatures
    .trim()
    .split(/\s+/)
    .some((signature) => {
      const value = /^v1,([A-Za-z0-9+/]{43}=)$/.exec(signature)?.[1];
      if (!value) return false;
      const candidate = Buffer.from(value, "base64");
      return (
        candidate.length === expected.length &&
        candidate.toString("base64") === value &&
        timingSafeEqual(expected, candidate)
      );
    });
  if (!valid) throw new ReceiverError(401, "Invalid webhook signature.");
  return id;
}

async function readBody(request) {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)
  ) {
    throw new ReceiverError(413, "Webhook payload is too large.");
  }
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ReceiverError(413, "Webhook payload is too large.");
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, length);
  } finally {
    reader.releaseLock();
  }
}

// A small, single-process durable inbox. Workers consuming the log must deduplicate
// by webhook_id. Replays keep that ID, so decide explicitly whether to repeat work.
export function createReceiver({
  secret,
  receiptsFile = "./received-events.ndjson",
}) {
  const key = decodeSecret(secret);
  let tail = Promise.resolve();
  async function persist(record) {
    const write = tail.then(async () => {
      const file = await open(receiptsFile, "a", 0o600);
      try {
        await file.writeFile(JSON.stringify(record) + "\n");
        await file.sync();
      } finally {
        await file.close();
      }
    });
    // Each caller still receives its write failure; later requests may retry.
    tail = write.then(
      () => undefined,
      () => undefined,
    );
    await write;
  }
  return async function receive(request) {
    if (new URL(request.url).pathname !== "/webhooks")
      return new Response("Not found", { status: 404 });
    if (request.method !== "POST")
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "POST" },
      });
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    ) {
      return new Response("Use application/json", { status: 415 });
    }
    try {
      const rawBody = await readBody(request);
      const id = verifyWebhook(rawBody, request.headers, key);
      let event;
      try {
        event = JSON.parse(rawBody.toString("utf8"));
      } catch {
        throw new ReceiverError(400, "Invalid JSON.");
      }
      if (
        !event ||
        typeof event !== "object" ||
        Array.isArray(event) ||
        typeof event.type !== "string" ||
        !("data" in event)
      ) {
        throw new ReceiverError(400, "Invalid event envelope.");
      }
      if (event.type === "endpoint.verification") {
        const data = event.data;
        if (
          !data ||
          typeof data !== "object" ||
          !uuid.test(data.endpoint_id) ||
          typeof data.challenge !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(data.challenge)
        ) {
          throw new ReceiverError(400, "Invalid verification challenge.");
        }
        const proof = createHmac("sha256", key)
          .update("cascadehook.verify.v1." + id + "." + data.challenge)
          .digest("base64");
        return Response.json({ proof });
      }
      await persist({ webhook_id: id, event });
      return new Response(null, { status: 204 });
    } catch (error) {
      if (error instanceof ReceiverError)
        return new Response(error.message, { status: error.status });
      return new Response("Receiver unavailable. Please retry.", {
        status: 503,
      });
    }
  };
}
