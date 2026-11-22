import { maxBodyBytes } from "./limits";

export type CaptureRecord = {
  receivedAt: number;
  method: string;
  path: string;
  query: string;
  headers: [string, string][];
  sourceIp: string | null;
  country: string | null;
  body: Uint8Array;
  bodySize: number;
  truncated: boolean;
};

// Added by Cloudflare rather than the sender; the IP and country get their own fields.
function isEdgeHeader(name: string) {
  return name.startsWith("cf-") || name.startsWith("x-forwarded-") || name === "x-real-ip" || name === "cdn-loop";
}

export async function readCapped(body: ReadableStream<Uint8Array> | null, cap = maxBodyBytes) {
  if (!body) return { bytes: new Uint8Array(0), received: 0, truncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > cap) {
      truncated = true;
      chunks.push(value.subarray(0, value.byteLength - (received - cap)));
      // Stop reading so an oversized body costs no more than the cap.
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  const stored = Math.min(received, cap);
  const bytes = new Uint8Array(stored);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, received, truncated };
}

export async function toRecord(request: Request, path: string): Promise<CaptureRecord> {
  const url = new URL(request.url);
  const headers: [string, string][] = [];
  for (const [name, value] of request.headers) {
    if (!isEdgeHeader(name)) headers.push([name, value]);
  }
  const { bytes, received, truncated } = await readCapped(request.body);
  const declared = Number(request.headers.get("content-length"));
  const country = (request.cf as { country?: unknown } | undefined)?.country;
  return {
    receivedAt: Date.now(),
    method: request.method,
    path,
    query: url.search.slice(1),
    headers,
    sourceIp: request.headers.get("cf-connecting-ip"),
    country: typeof country === "string" ? country : null,
    body: bytes,
    bodySize: truncated && Number.isFinite(declared) && declared > received ? declared : received,
    truncated,
  };
}
