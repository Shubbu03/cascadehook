import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const originalFetch = globalThis.fetch;
const originalBaseURL = process.env.NEXT_PUBLIC_API_BASE_URL;
let api: typeof import("./api");

function replaceFetch(
  implementation: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>,
) {
  globalThis.fetch = Object.assign(implementation, {
    preconnect: originalFetch.preconnect,
  });
}

beforeAll(async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example";
  api = await import("./api");
});

describe("workspace sidebar", () => {
  test("keeps member navigation read-only and marks nested routes active", async () => {
    const { SidebarNavigation } = await import(
      "../features/workspace/sidebar-navigation"
    );
    const html = renderToStaticMarkup(
      <SidebarNavigation
        projectId="project"
        role="member"
        pathname="/dashboard/projects/project/endpoints/endpoint"
      />,
    );
    expect(html).not.toContain("/api-keys");
    expect(html).not.toContain("/usage");
    expect(html).toContain("/settings");
    expect(html.match(/<a\b[^>]*aria-current="page"[^>]*>/)?.[0]).toContain(
      'href="/dashboard/projects/project/endpoints"',
    );
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  test("shows management pages for owners and admins", async () => {
    const { SidebarNavigation } = await import(
      "../features/workspace/sidebar-navigation"
    );
    for (const role of ["owner", "admin"] as const) {
      const html = renderToStaticMarkup(
        <SidebarNavigation
          projectId="project"
          role={role}
          pathname="/dashboard/projects/project/api-keys"
        />,
      );
      expect(html).toContain("/api-keys");
      expect(html).toContain("/usage");
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    }
  });

  test("preserves the selected organization when returning to projects", async () => {
    const { SidebarNavigation } = await import(
      "../features/workspace/sidebar-navigation"
    );
    const html = renderToStaticMarkup(
      <SidebarNavigation
        organizationId="organization"
        pathname="/dashboard/organizations/organization/settings"
      />,
    );
    expect(html).toContain('href="/dashboard?organization=organization"');
    expect(html.match(/<a\b[^>]*aria-current="page"[^>]*>/)?.[0]).toContain(
      'href="/dashboard/organizations/organization/settings"',
    );
    expect(html).not.toContain("/deliveries");
  });
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalBaseURL === undefined)
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseURL;
});

describe("authenticated API transport", () => {
  test("sends the observed replay cycle with a bearer token and no API cookies", async () => {
    let captured: Request | undefined;
    let options: RequestInit | undefined;
    replaceFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
      options = init;
      captured = new Request(input, init);
      return Response.json({ cycle: 3 }, { status: 202 });
    });
    await api.apiRequest(
      "/v1/projects/project/deliveries/delivery/replay",
      async () => "test-token",
      { method: "POST", data: { expected_cycle: 2 } },
    );
    expect(captured?.url).toBe(
      "https://api.example/v1/projects/project/deliveries/delivery/replay",
    );
    expect(captured?.headers.get("Authorization")).toBe("Bearer test-token");
    expect(options?.credentials).toBe("omit");
    expect(options?.cache).toBe("no-store");
    expect(await captured?.json()).toEqual({ expected_cycle: 2 });
  });
  test("does not issue a request without a current session", async () => {
    let called = false;
    replaceFetch(async () => {
      called = true;
      return Response.json({});
    });
    await expect(
      api.apiRequest("/v1/projects/project/api-keys", async () => null),
    ).rejects.toMatchObject({ status: 401 });
    expect(called).toBe(false);
  });
  test("maps replay conflicts without disclosing response text", async () => {
    replaceFetch(async () =>
      Response.json(
        { code: "delivery_cycle_changed", detail: "sensitive-response-text" },
        { status: 409 },
      ),
    );
    await expect(
      api.apiRequest("/replay", async () => "test-token", {
        method: "POST",
        data: { expected_cycle: 1 },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "delivery_cycle_changed",
      message:
        "This delivery changed while you were reviewing it. Check its current cycle before replaying.",
    });
  });
  test("explains a verified-email mismatch rather than a generic permission error", async () => {
    replaceFetch(async () =>
      Response.json({ code: "invitation_email_mismatch" }, { status: 403 }),
    );
    await expect(
      api.apiRequest("/v1/invitations/accept", async () => "test-token", {
        method: "POST",
        data: { token: "fixture" },
      }),
    ).rejects.toMatchObject({
      message:
        "Sign in with the verified email address this invitation was sent to.",
    });
  });
  test("hides cached data after access is denied or a resource disappears", async () => {
    const { QueryState } = await import("../components/query-state");
    for (const status of [401, 403, 404, 410]) {
      const query = {
        isPending: false,
        isError: true,
        error: new api.ApiError("Access unavailable", status),
        data: { previouslyAuthorized: true },
        isFetching: false,
        refetch: () => undefined,
      };
      const html = renderToStaticMarkup(
        <QueryState query={query}>cached-private-metadata</QueryState>,
      );
      expect(html).not.toContain("cached-private-metadata");
      expect(html).toContain("Access unavailable");
    }
  });
  test("retains cached data with a visible error during a temporary outage", async () => {
    const { QueryState } = await import("../components/query-state");
    const query = {
      isPending: false,
      isError: true,
      error: new api.ApiError("Temporary outage", 503),
      data: {},
      isFetching: false,
      refetch: () => undefined,
    };
    const html = renderToStaticMarkup(
      <QueryState query={query}>cached-result</QueryState>,
    );
    expect(html).toContain("cached-result");
    expect(html).toContain("Temporary outage");
  });
});
