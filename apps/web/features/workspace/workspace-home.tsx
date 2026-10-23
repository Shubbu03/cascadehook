"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import { PlusIcon } from "@phosphor-icons/react";
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useState } from "react";
import { Brand } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { apiRequest } from "@/lib/api";
import { notify } from "@/lib/notify";
import { ConnectionError } from "./connection-error";
import { NameForm } from "./name-form";
import { Projects } from "./projects";
import type { Account, Organization, Page } from "./types";

export function WorkspaceHome({ userId }: { userId: string }) {
  const session = useAuth();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: false,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );
  if (!session.isLoaded) return <WorkspaceLoading />;
  if (!session.isSignedIn || session.userId !== userId) {
    return (
      <main id="main-content" className="page-width workspace-main">
        <div className="empty-state">
          <h1>Your session has changed.</h1>
          <p>Continue with your current account to load its workspace.</p>
          <a href="/dashboard" className="button button-primary">
            Continue
          </a>
        </div>
      </main>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceContent userId={userId} />
    </QueryClientProvider>
  );
}

export function WorkspaceLoading() {
  return (
    <main id="main-content" className="page-width workspace-main">
      <Brand />
      <div className="workspace-loading" role="status">
        <p className="workspace-muted">Getting your workspace ready…</p>
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </main>
  );
}

function WorkspaceContent({ userId }: { userId: string }) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const account = useQuery({
    queryKey: ["account", userId],
    queryFn: ({ signal }) =>
      apiRequest<Account>("/v1/me", getToken, { signal }),
  });
  const organizationKey = ["organizations", userId];
  const organizations = useInfiniteQuery({
    queryKey: organizationKey,
    enabled: account.isSuccess,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiRequest<Page<Organization>>("/v1/organizations", getToken, {
        signal,
        params: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const create = useMutation({
    mutationFn: (name: string) =>
      apiRequest<Organization>("/v1/organizations", getToken, {
        method: "POST",
        data: { name },
      }),
    onSuccess: (organization) => {
      queryClient.setQueryData<InfiniteData<Page<Organization>>>(
        organizationKey,
        (previous) => {
          if (!previous)
            return {
              pages: [{ data: [organization], next_cursor: null }],
              pageParams: [null],
            };
          return {
            ...previous,
            pages: previous.pages.map((page, index) =>
              index === 0
                ? {
                    ...page,
                    data: [
                      organization,
                      ...page.data.filter(
                        (item) => item.id !== organization.id,
                      ),
                    ],
                  }
                : page,
            ),
          };
        },
      );
      setSelectedId(organization.id);
      setCreating(false);
      notify("Organization created. Let's add your first project.", "success");
      void queryClient.invalidateQueries({ queryKey: organizationKey });
    },
    onError: (error) => notify(error.message, "error"),
  });
  const items = organizations.data?.pages.flatMap((page) => page.data) ?? [];
  const active = items.find((item) => item.id === selectedId) ?? items[0];
  const error =
    account.error ?? (organizations.data ? null : organizations.error);
  const loading =
    account.isPending || (account.isSuccess && organizations.isPending);

  return (
    <div className="workspace-page">
      <header className="workspace-header page-width">
        <Brand />
        <div className="workspace-header-actions">
          <span>Your workspace</span>
          <ThemeSwitcher />
          <UserButton />
        </div>
      </header>
      <main id="main-content" className="workspace-main page-width">
        <div className="workspace-title">
          <span className="eyebrow">A HOME FOR YOUR WEBHOOKS</span>
          <h1>
            A little more organized.
            <br />A lot more connected.
          </h1>
          <p>
            Create a project for your application, or pick up with your team.
          </p>
        </div>
        {error ? (
          <ConnectionError
            error={error}
            retry={() => {
              void (account.isError
                ? account.refetch()
                : organizations.refetch());
            }}
            pending={account.isFetching || organizations.isFetching}
          />
        ) : loading ? (
          <div className="workspace-loading" role="status">
            <span className="sr-only">Loading your organizations…</span>
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        ) : (
          <>
            {organizations.isError && organizations.data && (
              <div className="workspace-notice">
                <ConnectionError
                  error={organizations.error}
                  retry={() => {
                    void organizations.refetch();
                  }}
                  pending={organizations.isFetching}
                />
              </div>
            )}
            <div className="workspace-grid">
              <aside
                className="organization-sidebar"
                aria-label="Organizations"
              >
                <div className="organization-heading">
                  <h2>Organizations</h2>
                </div>
                <ul className="organization-list">
                  {items.map((organization) => (
                    <li key={organization.id}>
                      <button
                        type="button"
                        className="organization-button"
                        aria-pressed={
                          !creating && active?.id === organization.id
                        }
                        onClick={() => {
                          setSelectedId(organization.id);
                          setCreating(false);
                        }}
                      >
                        <span
                          className="organization-initial"
                          aria-hidden="true"
                        >
                          {organization.name.slice(0, 1).toUpperCase()}
                        </span>
                        {organization.name}
                      </button>
                    </li>
                  ))}
                </ul>
                {organizations.hasNextPage && (
                  <button
                    type="button"
                    className="button button-small button-quiet"
                    disabled={organizations.isFetchingNextPage}
                    onClick={() => {
                      void organizations.fetchNextPage();
                    }}
                  >
                    {organizations.isFetchingNextPage
                      ? "Loading…"
                      : "Load more"}
                  </button>
                )}
                <button
                  type="button"
                  className="button button-small button-quiet"
                  onClick={() => {
                    create.reset();
                    setCreating(true);
                  }}
                >
                  <PlusIcon size={16} aria-hidden="true" />
                  New organization
                </button>
              </aside>
              {creating || !active ? (
                <NameForm
                  kind="organization"
                  pending={create.isPending}
                  error={create.error}
                  onSubmit={(name) => create.mutate(name)}
                  onCancel={active ? () => setCreating(false) : undefined}
                />
              ) : (
                <Projects
                  key={active.id}
                  organization={active}
                  userId={userId}
                />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
