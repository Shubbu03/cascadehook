import { toRecord } from "./capture";
import { hashToken, inboxIdPattern, newInboxId, newToken, tokenPattern } from "./ids";
import { limits } from "./limits";
import type { CreatedInbox, ErrorCode } from "./protocol";

export { Inbox } from "./inbox";

const securityHeaders: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
};

const captureCors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "600",
};

function secure(response: Response) {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function problem(status: number, code: ErrorCode, headers: Record<string, string> = {}) {
  return json(status, { code }, headers);
}

function text(status: number, body: string, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...headers } });
}

function allowedOrigins(env: Env) {
  const origins = env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) throw new Error("ALLOWED_ORIGINS is empty");
  return origins;
}

function viewerCors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, DELETE",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

function bearer(request: Request) {
  const match = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "");
  return match && tokenPattern.test(match[1]!) ? match[1]! : null;
}

async function limited(limiter: RateLimit, key: string) {
  return !(await limiter.limit({ key })).success;
}

async function viewerApi(request: Request, env: Env, segments: string[]) {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins(env).includes(origin)) return problem(403, "origin_not_allowed", { Vary: "Origin" });
  const cors = viewerCors(origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  // POST /_api/inboxes
  if (segments.length === 1 && segments[0] === "inboxes") {
    if (request.method !== "POST") return problem(405, "method_not_allowed", { ...cors, Allow: "POST" });
    if (await limited(env.CREATE_LIMIT, clientIp(request))) return problem(429, "rate_limited", { ...cors, "Retry-After": "60" });
    const inboxId = newInboxId();
    const token = newToken();
    const url = `${new URL(request.url).origin}/${inboxId}`;
    const stub = env.INBOX.get(env.INBOX.idFromName(inboxId));
    const { expiresAt } = await stub.create(inboxId, url, await hashToken(token));
    return json(201, { inboxId, url, token, expiresAt, limits } satisfies CreatedInbox, cors);
  }

  const id = segments[1];
  if (segments[0] !== "inboxes" || !id || !inboxIdPattern.test(id)) return problem(404, "not_found", cors);
  const stub = env.INBOX.get(env.INBOX.idFromName(id));

  // DELETE /_api/inboxes/{id}
  if (segments.length === 2) {
    if (request.method !== "DELETE") return problem(405, "method_not_allowed", { ...cors, Allow: "DELETE" });
    const token = bearer(request);
    // A wrong token looks the same as a missing inbox.
    if (!token || !(await stub.remove(await hashToken(token)))) return problem(404, "inbox_not_found", cors);
    return new Response(null, { status: 204, headers: cors });
  }

  // GET /_api/inboxes/{id}/live
  if (segments.length === 3 && segments[2] === "live") {
    if (request.method !== "GET") return problem(405, "method_not_allowed", { Allow: "GET" });
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return problem(426, "upgrade_required", { Upgrade: "websocket" });
    return stub.fetch(request);
  }
  return problem(404, "not_found", cors);
}

async function capture(request: Request, env: Env, id: string, path: string) {
  if (await limited(env.SEND_IP_LIMIT, clientIp(request)) || await limited(env.SEND_INBOX_LIMIT, id)) {
    return text(429, "Too many requests to this inbox. Slow down and try again shortly.\n", { ...captureCors, "Retry-After": "10" });
  }
  const record = await toRecord(request, path);
  const stub = env.INBOX.get(env.INBOX.idFromName(id));
  const result = await stub.capture(record);
  if (result.status === "not_found") return text(404, "This inbox doesn't exist or has expired.\n", captureCors);
  if (record.truncated) {
    return text(413, `Body too large. Only the first ${limits.maxBodyBytes / 1024} KB were recorded.\n`, captureCors);
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: captureCors });
  const { status, type, body } = result.response;
  const contentType = type === "application/json" ? "application/json" : "text/plain; charset=utf-8";
  return new Response(request.method === "HEAD" ? null : body, { status, headers: { "Content-Type": contentType, ...captureCors } });
}

async function route(request: Request, env: Env) {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").slice(1);
  const first = segments[0] ?? "";

  if (first === "_api") return viewerApi(request, env, segments.slice(1));
  if (url.pathname === "/robots.txt") return text(200, "User-agent: *\nDisallow: /\n");
  if (url.pathname === "/") {
    return request.method === "GET" || request.method === "HEAD"
      ? new Response(null, { status: 302, headers: { Location: env.TOOL_URL } })
      : text(404, "Not found.\n");
  }
  // Checked before any Durable Object is touched, so junk paths cost nothing.
  if (!inboxIdPattern.test(first)) return text(404, "Not found.\n");
  return capture(request, env, first, url.pathname.slice(first.length + 1));
}

export default {
  async fetch(request, env) {
    try {
      return secure(await route(request, env));
    } catch {
      return secure(problem(500, "internal_error"));
    }
  },
} satisfies ExportedHandler<Env>;
