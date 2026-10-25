import { afterEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fixture from "../../../server/internal/signing/testdata/signing-v1.json";
import {
  createReceiver,
  decodeSecret,
  verifyWebhook,
  MAX_BODY_BYTES,
} from "../../public/examples/receiver-core.mjs";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
const key = decodeSecret(fixture.secret);
function headers(body: string, timestamp = Math.floor(Date.now() / 1000)) {
  return new Headers({
    "Content-Type": "application/json",
    "Webhook-Id": fixture.id,
    "Webhook-Timestamp": String(timestamp),
    "Webhook-Signature":
      "v1," +
      createHmac("sha256", key)
        .update(fixture.id + "." + timestamp + ".")
        .update(body)
        .digest("base64"),
  });
}
async function receiver() {
  const directory = await mkdtemp(join(tmpdir(), "cascadehook-receiver-"));
  directories.push(directory);
  const file = join(directory, "events.ndjson");
  return {
    file,
    handle: createReceiver({ secret: fixture.secret, receiptsFile: file }),
  };
}

describe("downloadable receiver protocol", () => {
  test("matches the Go signing fixture using exact raw bytes", () => {
    const signed = new Headers({
      "Webhook-Id": fixture.id,
      "Webhook-Timestamp": fixture.timestamp,
      "Webhook-Signature": fixture.signature,
    });
    expect(
      verifyWebhook(
        Buffer.from(fixture.body),
        signed,
        key,
        Number(fixture.timestamp),
      ),
    ).toBe(fixture.id);
    expect(() =>
      verifyWebhook(
        Buffer.from(JSON.stringify(JSON.parse(fixture.body))),
        signed,
        key,
        Number(fixture.timestamp),
      ),
    ).toThrow("signature");
  });
  test("rejects stale/future timestamps, malformed headers, and wrong signatures", () => {
    const now = Math.floor(Date.now() / 1000);
    for (const timestamp of [now - 301, now + 301])
      expect(() =>
        verifyWebhook(
          Buffer.from(fixture.body),
          headers(fixture.body, timestamp),
          key,
          now,
        ),
      ).toThrow("tolerance");
    const malformed = headers(fixture.body);
    malformed.set("Webhook-Timestamp", "1e9");
    expect(() =>
      verifyWebhook(Buffer.from(fixture.body), malformed, key, now),
    ).toThrow("Malformed");
    const wrong = headers(fixture.body);
    wrong.set(
      "Webhook-Signature",
      "v1," + Buffer.alloc(32, 255).toString("base64"),
    );
    expect(() =>
      verifyWebhook(Buffer.from(fixture.body), wrong, key, now),
    ).toThrow("signature");
    expect(() => decodeSecret("whsec_invalid")).toThrow();
  });
  test("accepts a supported matching signature during rotation", () => {
    const signed = headers(fixture.body);
    signed.set(
      "Webhook-Signature",
      "v1," +
        Buffer.alloc(32, 255).toString("base64") +
        " " +
        signed.get("Webhook-Signature"),
    );
    expect(verifyWebhook(Buffer.from(fixture.body), signed, key)).toBe(
      fixture.id,
    );
  });
  test("answers a verified ownership challenge without persisting it", async () => {
    const { handle, file } = await receiver();
    const body = JSON.stringify({
      type: "endpoint.verification",
      data: { endpoint_id: fixture.id, challenge: fixture.challenge },
    });
    const response = await handle(
      new Request("http://receiver.local/webhooks", {
        method: "POST",
        headers: headers(body),
        body,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ proof: fixture.proof });
    expect(await Bun.file(file).exists()).toBe(false);
  });
  test("persists ordinary events before acknowledging, retaining duplicate IDs", async () => {
    const { handle, file } = await receiver();
    for (let i = 0; i < 2; i++) {
      const response = await handle(
        new Request("http://receiver.local/webhooks", {
          method: "POST",
          headers: headers(fixture.body),
          body: fixture.body,
        }),
      );
      expect(response.status).toBe(204);
    }
    const records = (await readFile(file, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.webhook_id === fixture.id)).toBe(
      true,
    );
    expect(records[0].event).toEqual(JSON.parse(fixture.body));
  });
  test("never acknowledges invalid signatures, oversized bodies, or failed persistence", async () => {
    const { handle, file } = await receiver();
    expect(
      (
        await handle(
          new Request("http://receiver.local/webhooks", {
            method: "POST",
            headers: headers(fixture.body),
            body: fixture.body + " ",
          }),
        )
      ).status,
    ).toBe(401);
    const oversized = "x".repeat(MAX_BODY_BYTES + 1);
    expect(
      (
        await handle(
          new Request("http://receiver.local/webhooks", {
            method: "POST",
            headers: headers(oversized),
            body: oversized,
          }),
        )
      ).status,
    ).toBe(413);
    expect(await Bun.file(file).exists()).toBe(false);
    const unavailable = createReceiver({
      secret: fixture.secret,
      receiptsFile: file + "/missing/events",
    });
    expect(
      (
        await unavailable(
          new Request("http://receiver.local/webhooks", {
            method: "POST",
            headers: headers(fixture.body),
            body: fixture.body,
          }),
        )
      ).status,
    ).toBe(503);
  });
});
