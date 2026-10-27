import { describe, expect, test } from "bun:test";
import type { Endpoint } from "@/features/endpoints/types";
import type { Delivery } from "@/features/activity/types";
import {
  chooseEndpoint,
  publicationBlock,
  setupChecks,
  type Activity,
  type ReadResult,
} from "./setup";

const endpoint: Endpoint = {
  id: "019a0000-0000-7000-8000-000000000001",
  project_id: "project",
  url: "https://receiver.example/webhooks",
  enabled: false,
  verified_at: null,
  has_signing_secret: false,
  event_types: ["order.created"],
  created_at: "2026-10-25T00:00:00Z",
  updated_at: "2026-10-25T00:00:00Z",
};
const empty: ReadResult<Activity> = {
  status: "ready",
  data: { latest: null, successful: null },
};
const activeKey = { status: "ready", data: true } as const;
const done = (checks: ReturnType<typeof setupChecks>) =>
  checks.filter((check) => check.state === "complete").map((check) => check.id);

describe("project setup progress", () => {
  test("new projects have no completed checks", () => {
    expect(
      done(setupChecks(undefined, { status: "ready", data: false }, empty)),
    ).toEqual([]);
  });
  test("verification and enabling must belong to the same endpoint", () => {
    const verified = {
      ...endpoint,
      id: "verified",
      has_signing_secret: true,
      verified_at: endpoint.created_at,
    };
    const selected = chooseEndpoint(
      [verified, { ...endpoint, id: "other", enabled: true }],
      "other",
    );
    expect(selected?.id).toBe("other");
    expect(done(setupChecks(selected, activeKey, empty))).toEqual([
      "endpoint",
      "key",
    ]);
    expect(done(setupChecks(verified, activeKey, empty))).not.toContain(
      "receiver",
    );
  });
  test("prefers a ready endpoint while honoring explicit selection and deletion", () => {
    const ready = {
      ...endpoint,
      id: "ready",
      enabled: true,
      has_signing_secret: true,
      verified_at: endpoint.created_at,
    };
    expect(chooseEndpoint([endpoint, ready], "")?.id).toBe("ready");
    expect(chooseEndpoint([endpoint, ready], endpoint.id)?.id).toBe(
      endpoint.id,
    );
    expect(chooseEndpoint([ready], endpoint.id)?.id).toBe("ready");
    expect(chooseEndpoint([], endpoint.id)).toBeUndefined();
  });
  test("accepted events with queued deliveries do not complete the success check", () => {
    const delivery = { id: "delivery", state: "pending" } as Delivery;
    expect(
      done(
        setupChecks(endpoint, activeKey, {
          status: "ready",
          data: { latest: delivery, successful: null },
        }),
      ),
    ).toEqual(["endpoint", "key", "event"]);
  });
  test("reports an observed success and updates current readiness after disabling", () => {
    const ready = {
      ...endpoint,
      enabled: true,
      has_signing_secret: true,
      verified_at: endpoint.created_at,
    };
    const successful = { id: "delivery", state: "succeeded" } as Delivery;
    const activity: ReadResult<Activity> = {
      status: "ready",
      data: { latest: successful, successful },
    };
    expect(done(setupChecks(ready, activeKey, activity))).toHaveLength(6);
    const changed = done(
      setupChecks(
        { ...ready, enabled: false },
        { status: "ready", data: false },
        activity,
      ),
    );
    expect(changed).not.toContain("receiver");
    expect(changed).not.toContain("key");
    expect(changed).toContain("delivery");
  });
  test("unavailable reads are unknown, and member progress excludes private keys", () => {
    const checks = setupChecks(
      endpoint,
      { status: "unavailable" },
      { status: "checking" },
    );
    expect(checks.find((check) => check.id === "key")?.state).toBe(
      "unavailable",
    );
    expect(checks.find((check) => check.id === "delivery")?.state).toBe(
      "checking",
    );
    expect(
      setupChecks(endpoint, null, empty).some((check) => check.id === "key"),
    ).toBe(false);
  });
  test("dashboard publishing requires a ready receiver but not a project API key", () => {
    const ready = {
      ...endpoint,
      enabled: true,
      has_signing_secret: true,
      verified_at: endpoint.created_at,
    };
    expect(publicationBlock(ready, "active")).toBeUndefined();
    expect(publicationBlock(ready, "paused")).toContain("paused");
    expect(publicationBlock(ready, "checking")).toContain("availability");
    expect(publicationBlock({ ...ready, enabled: false }, "active")).toContain(
      "enable",
    );
    expect(publicationBlock(undefined, "active")).toContain("Register");
    expect(publicationBlock(endpoint, "active")).toContain("secret");
  });
});
