import { describe, expect, test } from "bun:test";
import { deliveryFilters, deliveryStates, replayable } from "./types";
import { validateKeyReceipt, type KeyReceipt } from "@/features/api-keys/types";
import { invitationToken } from "@/features/settings/invitation-token";
import { invitationStatus, type Invitation } from "@/features/settings/types";

const projectId = "019a0000-0000-7000-8000-000000000001";
const resourceId = "019a0000-0000-7000-8000-000000000002";

describe("delivery filters and replay eligibility", () => {
  test("sends exact server filters without unrelated URL parameters", () => {
    expect(
      deliveryFilters(
        new URLSearchParams({
          state: "failed",
          event_id: resourceId,
          endpoint_id: projectId,
          unrelated: "ignored",
        }),
      ),
    ).toEqual({
      state: "failed",
      event_id: resourceId,
      endpoint_id: projectId,
    });
    expect(deliveryFilters(new URLSearchParams())).toEqual({});
  });
  test("rejects unsupported states and malformed identifiers", () => {
    for (const input of [
      "state=delivered",
      "event_id=invoice.paid",
      "endpoint_id=../other-project",
      "state=failed&event_id=not-a-uuid",
    ]) {
      expect(() => deliveryFilters(new URLSearchParams(input))).toThrow();
    }
  });
  test("only successful or failed terminal deliveries can replay", () => {
    const eligible = deliveryStates.filter((state) => replayable({ state }));
    expect(eligible).toEqual(["succeeded", "failed"]);
  });
});

describe("one-time API key receipts", () => {
  const secret = "ch_dev_" + "a".repeat(64);
  function receipt(): KeyReceipt {
    return {
      api_key: secret,
      key: {
        id: resourceId,
        project_id: projectId,
        name: "Integration",
        prefix: "ch_dev_" + "a".repeat(12),
        environment: "dev",
        status: "active",
        created_at: "2026-10-24T00:00:00Z",
        expires_at: null,
        revoked_at: null,
        revokes_at: null,
        rotated_to_id: null,
      },
    };
  }
  test("accepts a complete credential matching its project and metadata", () => {
    expect(validateKeyReceipt(receipt(), projectId).api_key).toBe(secret);
  });
  test("rejects wrong-project, mismatched-prefix, malformed, and mislabeled credentials", () => {
    const wrongProject = receipt();
    wrongProject.key.project_id = resourceId;
    const wrongPrefix = receipt();
    wrongPrefix.key.prefix = "ch_dev_" + "b".repeat(12);
    const wrongEnvironment = receipt();
    wrongEnvironment.key.environment = "live";
    const missingSecret = receipt();
    missingSecret.api_key = "";
    for (const value of [
      wrongProject,
      wrongPrefix,
      wrongEnvironment,
      missingSecret,
    ])
      expect(() => validateKeyReceipt(value, projectId)).toThrow("incomplete");
  });
});

describe("invitation handling", () => {
  const token = "chi_" + "b".repeat(64);
  test("accepts raw tokens and fragment links, never query-string tokens", () => {
    expect(invitationToken(" " + token + " ")).toBe(token);
    expect(
      invitationToken("https://app.example/invitations/accept#token=" + token),
    ).toBe(token);
    expect(
      invitationToken("https://app.example/invitations/accept?token=" + token),
    ).toBeNull();
    for (const value of [
      "",
      "chi_123",
      "chi_" + "g".repeat(64),
      token + "suffix",
      "javascript:alert(1)",
    ])
      expect(invitationToken(value)).toBeNull();
  });
  test("distinguishes pending, expired, revoked and accepted invitations", () => {
    const invitation: Invitation = {
      id: resourceId,
      organization_id: projectId,
      email: "teammate@example.com",
      role: "member",
      created_at: "2026-10-24T00:00:00Z",
      expires_at: "2026-10-25T00:00:00Z",
      accepted_at: null,
      revoked_at: null,
    };
    expect(
      invitationStatus(invitation, Date.parse("2026-10-24T01:00:00Z")),
    ).toBe("Pending");
    expect(
      invitationStatus(invitation, Date.parse(invitation.expires_at)),
    ).toBe("Expired");
    expect(
      invitationStatus({ ...invitation, revoked_at: invitation.created_at }, 0),
    ).toBe("Revoked");
    expect(
      invitationStatus(
        { ...invitation, accepted_at: invitation.created_at },
        0,
      ),
    ).toBe("Accepted");
  });
});
