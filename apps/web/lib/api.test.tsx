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
  test("organization usage works outside a project and is hidden from members", async () => {
    const { SidebarNavigation } = await import(
      "../features/workspace/sidebar-navigation"
    );
    const props = {
      organizationId: "organization",
      pathname: "/dashboard/organizations/organization/usage",
    };
    const admin = renderToStaticMarkup(
      <SidebarNavigation {...props} role="admin" />,
    );
    expect(admin).toContain(
      'href="/dashboard/organizations/organization/usage"',
    );
    expect(admin.match(/aria-current="page"/g)).toHaveLength(1);
    expect(admin.match(/<a\b[^>]*aria-current="page"[^>]*>/)?.[0]).toContain(
      '/usage"',
    );
    const member = renderToStaticMarkup(
      <SidebarNavigation {...props} role="member" />,
    );
    expect(member).not.toContain('/organization/usage"');
  });

  test("member identities show recognizable details with an honest provider fallback", async () => {
    const { MemberIdentity } = await import(
      "../features/settings/member-identity"
    );
    const member = {
      user_id: "019a0000-0000-7000-8000-000000000001",
      organization_id: "org",
      role: "member" as const,
      created_at: "now",
      updated_at: "now",
    };
    const html = renderToStaticMarkup(
      <MemberIdentity
        member={{
          ...member,
          profile: { name: "Ada Lovelace", email: "ada@example.com" },
        }}
        self
      />,
    );
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("ada@example.com");
    expect(html).toContain("(you)");
    const fallback = renderToStaticMarkup(<MemberIdentity member={member} />);
    expect(fallback).toContain("Member 00000001");
    expect(fallback).toContain(member.user_id);
  });
  test("marks Overview active only at the project root", async () => {
    const { SidebarNavigation } = await import(
      "../features/workspace/sidebar-navigation"
    );
    const html = renderToStaticMarkup(
      <SidebarNavigation
        projectId="project"
        role="owner"
        pathname="/dashboard/projects/project"
      />,
    );
    expect(html.match(/<a\b[^>]*aria-current="page"[^>]*>/)?.[0]).toContain(
      'href="/dashboard/projects/project"',
    );
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
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

describe("project Overview reads", () => {
  test("queries selected-endpoint history separately from successful deliveries", async () => {
    const { QueryClient } = await import("@tanstack/react-query");
    const { setupActivityQuery } = await import(
      "../features/projects/overview/queries"
    );
    const requests: URL[] = [];
    replaceFetch(async (input, init) => {
      const url = new URL(new Request(input, init).url);
      requests.push(url);
      return Response.json({
        data: url.searchParams.has("state")
          ? []
          : [{ id: "queued", state: "pending" }],
        next_cursor: null,
      });
    });
    const client = new QueryClient();
    const result = await client.fetchQuery(
      setupActivityQuery("user", "project", "endpoint", async () => "token"),
    );
    expect(result.latest?.state).toBe("pending");
    expect(result.successful).toBeNull();
    expect(requests).toHaveLength(2);
    expect(
      requests.every(
        (url) =>
          url.pathname === "/v1/projects/project/deliveries" &&
          url.searchParams.get("endpoint_id") === "endpoint" &&
          url.searchParams.get("limit") === "1",
      ),
    ).toBe(true);
    expect(
      requests.filter((url) => url.searchParams.get("state") === "succeeded"),
    ).toHaveLength(1);
    client.clear();
  });
  test("checks only active keys and disables private reads for members", async () => {
    const { QueryClient, skipToken } = await import("@tanstack/react-query");
    const { setupKeyQuery } = await import(
      "../features/projects/overview/queries"
    );
    let request: URL | undefined;
    replaceFetch(async (input, init) => {
      request = new URL(new Request(input, init).url);
      return Response.json({ data: [], next_cursor: null });
    });
    const client = new QueryClient();
    await client.fetchQuery(
      setupKeyQuery("user", "project", true, async () => "token"),
    );
    expect(request?.searchParams.get("status")).toBe("active");
    expect(request?.searchParams.get("limit")).toBe("1");
    const member = setupKeyQuery("user", "project", false, async () => "token");
    expect(member.queryFn === skipToken).toBe(true);
    expect([...member.queryKey]).toEqual([
      "api-keys",
      "user",
      "project",
      "overview-active",
    ]);
    client.clear();
  });
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalBaseURL === undefined)
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseURL;
});

describe("authenticated API transport", () => {
  test("publishes through the session project route with an idempotency key and exact JSON bytes", async () => {
    const { preparePublication, publishEvent } = await import(
      "../features/activity/publication"
    );
    const project = {
      id: "019a0000-0000-7000-8000-000000000001",
      role: "admin" as const,
    };
    const receipt = {
      id: "019a0000-0000-7000-8000-000000000002",
      type: "order.created",
      delivery_count: 1,
      created_at: "2026-10-27T10:00:00Z",
    };
    const publication = preparePublication(
      "order.created",
      '{ "id": 9007199254740993, "amount": 1.00 }',
      "dashboard-request",
    );
    let count = 0;
    replaceFetch(async (input, init) => {
      count++;
      const request = new Request(input, init);
      expect(new URL(request.url).pathname).toBe(
        "/v1/projects/" + project.id + "/events",
      );
      expect(request.method).toBe("POST");
      expect(request.headers.get("Authorization")).toBe("Bearer session-token");
      expect(request.headers.get("Content-Type")).toBe("application/json");
      expect(request.headers.get("Idempotency-Key")).toBe("dashboard-request");
      expect(init?.credentials).toBe("omit");
      expect(await request.text()).toBe(publication.body);
      if (count === 1) throw new TypeError("Connection lost after sending");
      return Response.json(receipt, { status: 202 });
    });
    await expect(
      publishEvent(project, publication, async () => "session-token"),
    ).rejects.toMatchObject({ status: 0 });
    expect(count).toBe(1);
    expect(
      await publishEvent(project, publication, async () => "session-token"),
    ).toEqual(receipt);
    expect(count).toBe(2);
  });
  test("blocks member publication and missing sessions without making an API request", async () => {
    const { preparePublication, publishEvent } = await import(
      "../features/activity/publication"
    );
    const publication = preparePublication("order.created", "{}", "key");
    let requests = 0;
    replaceFetch(async () => {
      requests++;
      throw new Error("Must not fetch");
    });
    const project = {
      id: "019a0000-0000-7000-8000-000000000001",
      role: "member" as const,
    };
    await expect(
      publishEvent(project, publication, async () => "token"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      publishEvent(
        { ...project, role: "owner" },
        publication,
        async () => null,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(requests).toBe(0);
  });
  test("does not report publication accepted for a malformed or mismatched receipt", async () => {
    const { preparePublication, publishEvent } = await import(
      "../features/activity/publication"
    );
    const publication = preparePublication("order.created", "{}", "key");
    const project = {
      id: "019a0000-0000-7000-8000-000000000001",
      role: "owner" as const,
    };
    const receipt = {
      id: "019a0000-0000-7000-8000-000000000002",
      type: "order.created",
      created_at: "2026-10-27T10:00:00Z",
      delivery_count: 0,
    };
    for (const result of [
      null,
      { ...receipt, id: "invalid" },
      { ...receipt, type: "other.event" },
      { ...receipt, delivery_count: -1 },
      { ...receipt, created_at: "invalid" },
    ]) {
      replaceFetch(async () => Response.json(result, { status: 202 }));
      await expect(
        publishEvent(project, publication, async () => "token"),
      ).rejects.toThrow("could not be confirmed");
    }
    replaceFetch(async () => Response.json(receipt, { status: 202 }));
    expect(
      await publishEvent(project, publication, async () => "token"),
    ).toEqual(receipt);
  });
  test("explains publication conflicts and payload limits without exposing server responses", async () => {
    const { preparePublication, publishEvent } = await import(
      "../features/activity/publication"
    );
    const publication = preparePublication("order.created", "{}", "key");
    const project = {
      id: "019a0000-0000-7000-8000-000000000001",
      role: "owner" as const,
    };
    replaceFetch(async () =>
      Response.json(
        { code: "idempotency_conflict", detail: "private diagnostic" },
        { status: 409 },
      ),
    );
    await expect(
      publishEvent(project, publication, async () => "token"),
    ).rejects.toMatchObject({
      status: 409,
      code: "idempotency_conflict",
      message: expect.stringContaining("different payload"),
    });
    replaceFetch(async () =>
      Response.json({ code: "request_too_large" }, { status: 413 }),
    );
    await expect(
      publishEvent(project, publication, async () => "token"),
    ).rejects.toThrow("256 KiB");
  });
  test("deletes only a manageable endpoint in the confirmed project without a request body", async () => {
    const { requestEndpointDeletion } = await import(
      "../features/endpoints/deletion"
    );
    const project = {
      id: "019a0000-0000-7000-8000-000000000001",
      organization_id: "org",
      name: "Billing",
      role: "owner" as const,
      created_at: "now",
      updated_at: "now",
    };
    const endpoint = {
      id: "019a0000-0000-7000-8000-000000000002",
      project_id: project.id,
      url: "https://receiver.example/hooks",
      enabled: false,
      verified_at: null,
      has_signing_secret: false,
      event_types: ["invoice.paid"],
      created_at: "now",
      updated_at: "now",
    };
    let requests = 0;
    replaceFetch(async (input, init) => {
      requests++;
      const request = new Request(input, init);
      expect(request.url).toBe(
        "https://api.example/v1/projects/" +
          project.id +
          "/endpoints/" +
          endpoint.id,
      );
      expect(request.method).toBe("DELETE");
      expect(request.headers.get("Authorization")).toBe("Bearer confirmed");
      expect(await request.text()).toBe("");
      return new Response(null, { status: 204 });
    });
    await expect(
      requestEndpointDeletion(
        { ...project, role: "member" },
        endpoint,
        async () => "confirmed",
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      requestEndpointDeletion(
        project,
        { ...endpoint, project_id: "other" },
        async () => "confirmed",
      ),
    ).rejects.toThrow("does not belong");
    expect(requests).toBe(0);
    await requestEndpointDeletion(
      { ...project, role: "admin" },
      endpoint,
      async () => "confirmed",
    );
    expect(requests).toBe(1);
  });

  test("leaves using the authenticated Go account ID and preserves last-owner errors", async () => {
    const { leaveOrganization } = await import(
      "../features/settings/membership-actions"
    );
    const organizationId = "019a0000-0000-7000-8000-000000000001";
    const accountId = "019a0000-0000-7000-8000-000000000002";
    const requests: string[] = [];
    replaceFetch(async (input, init) => {
      const request = new Request(input, init);
      expect(request.headers.get("Authorization")).toBe("Bearer confirmed");
      requests.push(request.method + " " + new URL(request.url).pathname);
      if (request.method === "GET") return Response.json({ id: accountId });
      expect(await request.text()).toBe("");
      return Response.json(
        { code: "last_organization_owner" },
        { status: 409 },
      );
    });
    await expect(
      leaveOrganization(organizationId, async () => "confirmed"),
    ).rejects.toThrow("at least one owner");
    expect(requests).toEqual([
      "GET /v1/me",
      "DELETE /v1/organizations/" + organizationId + "/members/" + accountId,
    ]);
  });

  test("does not remove a membership when the current account cannot be confirmed", async () => {
    const { leaveOrganization } = await import(
      "../features/settings/membership-actions"
    );
    let requests = 0;
    replaceFetch(async () => {
      requests++;
      return Response.json({ id: "user_clerk_identity" });
    });
    await expect(
      leaveOrganization(
        "019a0000-0000-7000-8000-000000000001",
        async () => "token",
      ),
    ).rejects.toThrow("account could not be confirmed");
    expect(requests).toBe(1);
  });

  test("binds destructive operations to the confirmed session and rejects switched accounts", async () => {
    const { deletionToken } = await import("../features/settings/deletion");
    let current = {
      id: "session-a",
      user: { id: "user-a" },
      getToken: async () => "token-a",
    };
    const token = deletionToken(current, "session-a", "user-a");
    current = {
      id: "session-b",
      user: { id: "user-b" },
      getToken: async () => "token-b",
    };
    expect(await token()).toBe("token-a");
    expect(() => deletionToken(current, "session-a", "user-a")).toThrow(
      "account changed",
    );
    expect(() => deletionToken(null, "session-a", "user-a")).toThrow(
      "account changed",
    );
  });
  test("requires exact confirmation and the owner role before requesting organization deletion", async () => {
    const { requestOrganizationDeletion } = await import(
      "../features/settings/deletion"
    );
    const organization = {
      id: "019a0000-0000-7000-8000-000000000001",
      name: "Billing",
      role: "owner" as const,
      created_at: "2026-10-25T00:00:00Z",
      updated_at: "2026-10-25T00:00:00Z",
    };
    let requests = 0;
    replaceFetch(async (input, init) => {
      requests++;
      const request = new Request(input, init);
      expect(request.method).toBe("DELETE");
      expect(request.url).toBe(
        "https://api.example/v1/organizations/" + organization.id,
      );
      expect(await request.text()).toBe("");
      expect(init?.credentials).toBe("omit");
      return Response.json(
        {
          organization_id: organization.id,
          deletion_requested_at: organization.created_at,
        },
        { status: 202 },
      );
    });
    for (const role of ["admin", "member"] as const)
      await expect(
        requestOrganizationDeletion(
          { ...organization, role },
          "Billing",
          async () => "token",
        ),
      ).rejects.toMatchObject({ status: 403 });
    await expect(
      requestOrganizationDeletion(organization, "billing", async () => "token"),
    ).rejects.toThrow("exact");
    expect(requests).toBe(0);
    await requestOrganizationDeletion(
      organization,
      "Billing",
      async () => "token",
    );
    expect(requests).toBe(1);
  });
  test("does not confirm deletion from a malformed or wrong-resource receipt", async () => {
    const { requestAccountDeletion } = await import(
      "../features/settings/deletion"
    );
    for (const receipt of [
      { user_id: "other", deletion_requested_at: "2026-10-25T00:00:00Z" },
      {
        user_id: "019a0000-0000-7000-8000-000000000001",
        deletion_requested_at: "invalid",
      },
      null,
    ]) {
      replaceFetch(async () => Response.json(receipt, { status: 202 }));
      await expect(
        requestAccountDeletion(
          "019a0000-0000-7000-8000-000000000001",
          "DELETE",
          async () => "token",
        ),
      ).rejects.toThrow("could not be confirmed");
    }
  });
  test("sends account deletion once with no body and explains ownership conflicts", async () => {
    const { requestAccountDeletion } = await import(
      "../features/settings/deletion"
    );
    let requests = 0;
    replaceFetch(async (input, init) => {
      requests++;
      const request = new Request(input, init);
      expect(request.method).toBe("DELETE");
      expect(request.url).toBe("https://api.example/v1/me");
      expect(await request.text()).toBe("");
      return Response.json(
        { code: "account_owns_organizations" },
        { status: 409 },
      );
    });
    await expect(
      requestAccountDeletion(
        "019a0000-0000-7000-8000-000000000001",
        "delete",
        async () => "token",
      ),
    ).rejects.toThrow("Type DELETE");
    expect(requests).toBe(0);
    await expect(
      requestAccountDeletion(
        "019a0000-0000-7000-8000-000000000001",
        "DELETE",
        async () => "token",
      ),
    ).rejects.toThrow("promote another owner");
    expect(requests).toBe(1);
    replaceFetch(async () => {
      requests++;
      return Response.json({ code: "request_timeout" }, { status: 503 });
    });
    await expect(
      requestAccountDeletion(
        "019a0000-0000-7000-8000-000000000001",
        "DELETE",
        async () => "token",
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(requests).toBe(2);
  });
  test("checks ownership beyond the first organizations page", async () => {
    const { ownedOrganizations } = await import(
      "../features/settings/deletion"
    );
    const requests: URL[] = [];
    replaceFetch(async (input, init) => {
      const url = new URL(new Request(input, init).url);
      requests.push(url);
      return Response.json(
        url.searchParams.has("cursor")
          ? { data: [{ id: "owned", role: "owner" }], next_cursor: null }
          : {
              data: [{ id: "joined", role: "member" }],
              next_cursor: "second-page",
            },
      );
    });
    const owned = await ownedOrganizations(
      async () => "token",
      new AbortController().signal,
    );
    expect(owned.map((organization) => organization.id)).toEqual(["owned"]);
    expect(requests).toHaveLength(2);
    expect(requests[1].searchParams.get("cursor")).toBe("second-page");
  });
  test("requires a second confirmation before rendering a destructive dialog", async () => {
    const { QueryClient, QueryClientProvider } = await import(
      "@tanstack/react-query"
    );
    const { DeleteAction } = await import("../features/settings/delete-action");
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <DeleteAction
          title="Delete account"
          description="Account removal"
          confirmationText="DELETE"
          onDelete={async () => {
            throw new Error("Must not run during rendering");
          }}
          onDeleted={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(html).not.toContain("<dialog");
    expect(html).toContain("disabled");
    expect(html).toContain("Type <code>DELETE</code> to confirm");
  });
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
