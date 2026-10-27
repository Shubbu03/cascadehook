import { describe, expect, test } from "bun:test";
import {
  MAX_EVENT_BYTES,
  preparePublication,
  PublicationError,
} from "./publication";

describe("dashboard event validation", () => {
  test("preserves payload whitespace and large JSON numbers in the event envelope", () => {
    const payload = '{\n  "id": 9007199254740993, "amount": 1.00\n}';
    const publication = preparePublication(
      " order.created ",
      payload,
      "test-001",
    );
    expect(publication.body).toBe(
      '{"type":"order.created","data":' + payload + "}",
    );
    expect(publication.idempotencyKey).toBe("test-001");
    expect(Object.isFrozen(publication)).toBe(true);
  });
  test("accepts each JSON data shape, including null", () => {
    for (const payload of ["null", "[]", '"value"', "true", "42", "{}"]) {
      expect(
        JSON.parse(preparePublication("test.event", payload, "key").body),
      ).toEqual({ type: "test.event", data: JSON.parse(payload) });
    }
  });
  test("rejects invalid types, malformed JSON, and unsafe request keys with field errors", () => {
    const cases = [
      ["Order Created", "{}", "key", "type"],
      ["ok", "{}", "key", "type"],
      ["order.created", "{broken", "key", "payload"],
      ["order.created", "{} {}", "key", "payload"],
      ["order.created", "", "key", "payload"],
      ["order.created", "{}", "", "idempotencyKey"],
      ["order.created", "{}", "key\nheader", "idempotencyKey"],
      ["order.created", "{}", "a".repeat(256), "idempotencyKey"],
    ] as const;
    for (const [type, payload, key, field] of cases) {
      try {
        preparePublication(type, payload, key);
        throw new Error("Invalid publication was accepted");
      } catch (error) {
        expect(error).toBeInstanceOf(PublicationError);
        expect((error as PublicationError).field).toBe(field);
      }
    }
  });
  test("bounds the UTF-8 bytes of the full envelope, including JSON wrapper overhead", () => {
    const overhead = new TextEncoder().encode(
      preparePublication("test.event", '""', "key").body,
    ).length;
    expect(
      new TextEncoder().encode(
        preparePublication(
          "test.event",
          '"' + "a".repeat(MAX_EVENT_BYTES - overhead) + '"',
          "key",
        ).body,
      ).length,
    ).toBe(MAX_EVENT_BYTES);
    expect(() =>
      preparePublication(
        "test.event",
        '"' + "a".repeat(MAX_EVENT_BYTES - overhead + 1) + '"',
        "key",
      ),
    ).toThrow("256 KiB");
    expect(() =>
      preparePublication(
        "test.event",
        JSON.stringify("界".repeat(100_000)),
        "key",
      ),
    ).toThrow("256 KiB");
  });
});
