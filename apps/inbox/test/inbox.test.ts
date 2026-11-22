import { env, listDurableObjectIds, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { readCapped } from "../src/capture";
import { inboxIdPattern, newInboxId, tokenPattern } from "../src/ids";
import type { Inbox } from "../src/inbox";
import { maxBodyBytes, maxRequests } from "../src/limits";
import { closeCodes, type CapturedRequest } from "../src/protocol";
import { base, call, connect, createInbox, freshIp, origin, send } from "./helpers";

function decode(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function stub(inboxId: string) {
  return env.INBOX.get(env.INBOX.idFromName(inboxId));
}

function tables(inboxId: string) {
  return runInDurableObject(stub(inboxId), (_instance: Inbox, state) =>
    state.storage.sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").toArray().map((row) => row.name));
}

describe("ids", () => {
  it("generates 26-character base32 inbox ids", () => {
    const ids = new Set(Array.from({ length: 200 }, newInboxId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(inboxIdPattern);
  });
});

describe("creating an inbox", () => {
  it("returns a well-formed id, URL, and token", async () => {
    const inbox = await createInbox();
    expect(inbox.inboxId).toMatch(inboxIdPattern);
    expect(inbox.token).toMatch(tokenPattern);
    expect(inbox.url).toBe(`${base}/${inbox.inboxId}`);
    expect(inbox.expiresAt - Date.now()).toBeGreaterThan(23.9 * 3600 * 1000);
    expect(inbox.limits).toEqual({ maxRequests: 50, maxBodyBytes: 262144, ttlSeconds: 86400 });
  });

  it("refuses origins that aren't allowed", async () => {
    const response = await call("/_api/inboxes", { method: "POST", headers: { Origin: "https://evil.example", "CF-Connecting-IP": freshIp() } });
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers preflights for the allowed origin", async () => {
    const response = await call("/_api/inboxes", { method: "OPTIONS", headers: { Origin: origin } });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
  });

  it("rate-limits creation per IP", async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt++) {
      const response = await call("/_api/inboxes", { method: "POST", headers: { Origin: origin, "CF-Connecting-IP": ip } });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 5).every((status) => status === 201)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("capturing requests", () => {
  it("stores the exact bytes and request details", async () => {
    const inbox = await createInbox();
    const viewer = await connect(inbox.inboxId, inbox.token);
    await viewer.next(1);
    const body = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d, 0x0d, 0x0a, 0xff, 0x00, 0xc3]);
    const response = await send(inbox.inboxId, {
      method: "PUT",
      path: "/stripe/events",
      body,
      headers: { "Content-Type": "application/octet-stream", "Stripe-Signature": "t=1,v1=abc", "CF-Connecting-IP": "198.51.100.7", "X-Forwarded-Proto": "https" },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");

    const [, message] = await viewer.next(2);
    expect(message?.type).toBe("request");
    const request = (message as { request: CapturedRequest }).request;
    expect(request.method).toBe("PUT");
    expect(request.path).toBe("/stripe/events");
    expect(request.sourceIp).toBe("198.51.100.7");
    expect(decode(request.bodyBase64)).toEqual(body);
    expect(request.bodySize).toBe(body.length);
    expect(request.truncated).toBe(false);
    const names = request.headers.map(([name]) => name);
    expect(names).toContain("stripe-signature");
    expect(names).not.toContain("cf-connecting-ip");
    expect(names).not.toContain("x-forwarded-proto");
  });

  it("keeps the query string and the root path", async () => {
    const inbox = await createInbox();
    await send(inbox.inboxId, { method: "GET", path: "?a=1&b=two" });
    const viewer = await connect(inbox.inboxId, inbox.token);
    const [, message] = await viewer.next(2);
    const request = (message as { request: CapturedRequest }).request;
    expect(request.path).toBe("");
    expect(request.query).toBe("a=1&b=two");
    expect(request.method).toBe("GET");
  });

  it("stores an oversized body truncated and answers 413", async () => {
    const inbox = await createInbox();
    const body = new Uint8Array(maxBodyBytes + 5000).fill(0x61);
    const response = await send(inbox.inboxId, { body });
    expect(response.status).toBe(413);
    const viewer = await connect(inbox.inboxId, inbox.token);
    const [, message] = await viewer.next(2);
    const request = (message as { request: CapturedRequest }).request;
    expect(request.truncated).toBe(true);
    expect(decode(request.bodyBase64).length).toBe(maxBodyBytes);
    expect(request.bodySize).toBe(maxBodyBytes + 5000);
  });

  it("reads at most the cap from a stream", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6).fill(1));
        controller.enqueue(new Uint8Array(6).fill(2));
        controller.enqueue(new Uint8Array(6).fill(3));
        controller.close();
      },
    });
    const result = await readCapped(stream, 10);
    expect(result.truncated).toBe(true);
    expect(Array.from(result.bytes)).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 2, 2]);
  });

  it("keeps only the newest 50 requests", async () => {
    const inbox = await createInbox();
    const target = stub(inbox.inboxId);
    for (let index = 1; index <= maxRequests + 1; index++) {
      await target.capture({
        receivedAt: Date.now(), method: "POST", path: "", query: String(index), headers: [], sourceIp: null, country: null,
        body: new Uint8Array(0), bodySize: 0, truncated: false,
      });
    }
    const seqs = await runInDurableObject(target, (_instance: Inbox, state) =>
      state.storage.sql.exec<{ query: string }>("SELECT query FROM requests ORDER BY seq").toArray().map((row) => row.query));
    expect(seqs.length).toBe(maxRequests);
    expect(seqs[0]).toBe("2");
    expect(seqs.at(-1)).toBe(String(maxRequests + 1));
  });

  it("returns 404 for an unknown inbox and leaves no storage behind", async () => {
    const unknown = newInboxId();
    const response = await send(unknown, { body: "{}" });
    expect(response.status).toBe(404);
    expect(await tables(unknown)).toEqual([]);
  });

  it("rejects malformed ids without touching a Durable Object", async () => {
    const before = (await listDurableObjectIds(env.INBOX)).length;
    for (const path of ["/favicon.ico", "/ABCDEFGHIJKLMNOPQRSTUVWXYZ", "/short", "/wp-login.php"]) {
      expect((await call(path, { method: "POST" })).status).toBe(404);
    }
    expect((await listDurableObjectIds(env.INBOX)).length).toBe(before);
  });

  it("captures preflights and allows any origin", async () => {
    const inbox = await createInbox();
    const response = await send(inbox.inboxId, { method: "OPTIONS", headers: { Origin: "https://app.example", "Access-Control-Request-Method": "POST" } });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const viewer = await connect(inbox.inboxId, inbox.token);
    const [, message] = await viewer.next(2);
    expect((message as { request: CapturedRequest }).request.method).toBe("OPTIONS");
  });

  it("rate-limits sends per inbox", async () => {
    const inbox = await createInbox();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 32; attempt++) statuses.push((await send(inbox.inboxId, { body: "x" })).status);
    expect(statuses[0]).toBe(200);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("security headers", () => {
  it("are on every kind of response", async () => {
    const inbox = await createInbox();
    const responses = [
      await call("/robots.txt"),
      await call("/"),
      await call("/nope"),
      await send(inbox.inboxId, { body: "<html><script>alert(1)</script></html>", headers: { "Content-Type": "text/html" } }),
      await call("/_api/inboxes", { method: "OPTIONS", headers: { Origin: origin } }),
    ];
    for (const response of responses) {
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("content-security-policy")).toContain("sandbox");
      expect(response.headers.get("content-type") ?? "").not.toContain("html");
    }
  });

  it("serves robots.txt that blocks everything and redirects the root", async () => {
    expect(await (await call("/robots.txt")).text()).toBe("User-agent: *\nDisallow: /\n");
    const root = await call("/", { redirect: "manual" });
    expect(root.status).toBe(302);
    expect(root.headers.get("location")).toBe("https://cascadehook.com/tools/webhook-tester");
  });
});

describe("live view", () => {
  it("sends ready, then the backlog after the cursor, then live requests", async () => {
    const inbox = await createInbox();
    for (const query of ["one", "two", "three"]) await send(inbox.inboxId, { path: `?${query}` });
    const viewer = await connect(inbox.inboxId, inbox.token, 1);
    const initial = await viewer.next(3);
    expect(initial[0]).toMatchObject({ type: "ready", latestSeq: 3, inbox: { id: inbox.inboxId, url: inbox.url, maxRequests: 50 } });
    expect(initial.slice(1).map((message) => (message as { request: CapturedRequest }).request.query)).toEqual(["two", "three"]);
    await send(inbox.inboxId, { path: "?four" });
    const [, , , live] = await viewer.next(4);
    expect((live as { request: CapturedRequest }).request).toMatchObject({ seq: 4, query: "four" });
  });

  it("reports a wrong token as not found and closes", async () => {
    const inbox = await createInbox();
    const viewer = await connect(inbox.inboxId, "A".repeat(43));
    expect((await viewer.next(1))[0]).toEqual({ type: "error", code: "inbox_not_found" });
    expect((await viewer.closed).code).toBe(closeCodes.gone);
  });

  it("refuses other origins and non-upgrade requests", async () => {
    const inbox = await createInbox();
    const other = await call(`/_api/inboxes/${inbox.inboxId}/live`, { headers: { Upgrade: "websocket", Origin: "https://evil.example" } });
    expect(other.status).toBe(403);
    const plain = await call(`/_api/inboxes/${inbox.inboxId}/live`, { headers: { Origin: origin } });
    expect(plain.status).toBe(426);
  });
});

describe("deletion", () => {
  it("needs the right token", async () => {
    const inbox = await createInbox();
    const wrong = await call(`/_api/inboxes/${inbox.inboxId}`, { method: "DELETE", headers: { Origin: origin, Authorization: `Bearer ${"B".repeat(43)}` } });
    expect(wrong.status).toBe(404);
    const missing = await call(`/_api/inboxes/${inbox.inboxId}`, { method: "DELETE", headers: { Origin: origin } });
    expect(missing.status).toBe(404);
    expect((await send(inbox.inboxId, { body: "still here" })).status).toBe(200);
  });

  it("wipes storage, notifies viewers, and stops capture", async () => {
    const inbox = await createInbox();
    await send(inbox.inboxId, { body: "secret-ish" });
    const viewer = await connect(inbox.inboxId, inbox.token);
    await viewer.next(2);
    const response = await call(`/_api/inboxes/${inbox.inboxId}`, { method: "DELETE", headers: { Origin: origin, Authorization: `Bearer ${inbox.token}` } });
    expect(response.status).toBe(204);
    expect((await viewer.next(3))[2]).toEqual({ type: "deleted" });
    expect((await viewer.closed).code).toBe(closeCodes.gone);
    expect(await tables(inbox.inboxId)).toEqual([]);
    expect((await send(inbox.inboxId, { body: "after" })).status).toBe(404);
  });

  it("the expiry alarm wipes everything after 24 hours", async () => {
    const inbox = await createInbox();
    await send(inbox.inboxId, { body: "{}" });
    const viewer = await connect(inbox.inboxId, inbox.token);
    await viewer.next(2);
    const target = stub(inbox.inboxId);
    const alarm = await runInDurableObject(target, (_instance: Inbox, state) => state.storage.getAlarm());
    expect(alarm).toBe(inbox.expiresAt);
    expect(await runDurableObjectAlarm(target)).toBe(true);
    expect((await viewer.next(3))[2]).toEqual({ type: "expired" });
    expect((await viewer.closed).code).toBe(closeCodes.expired);
    expect(await tables(inbox.inboxId)).toEqual([]);
    expect(await runInDurableObject(target, (_instance: Inbox, state) => state.storage.getAlarm())).toBeNull();
    expect((await send(inbox.inboxId, { body: "{}" })).status).toBe(404);
  });

  it("treats an inbox past its expiry as gone even if the alarm is late", async () => {
    const inbox = await createInbox();
    const target = stub(inbox.inboxId);
    await runInDurableObject(target, (_instance: Inbox, state) => {
      state.storage.sql.exec("UPDATE meta SET expires_at = ?", Date.now() - 1);
    });
    expect((await send(inbox.inboxId, { body: "{}" })).status).toBe(404);
    expect(await tables(inbox.inboxId)).toEqual([]);
  });
});
