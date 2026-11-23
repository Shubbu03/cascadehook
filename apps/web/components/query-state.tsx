"use client";

import { Button } from "@/components/button";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { ConnectionError } from "@/features/workspace/connection-error";
import { TableSkeleton } from "@/features/workspace/skeletons";
import { ApiError } from "@/lib/api";

export function QueryState({
  query,
  children,
  loading = <TableSkeleton />,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    data?: unknown;
    isFetching: boolean;
    refetch: () => unknown;
  };
  children: React.ReactNode;
  loading?: React.ReactNode;
}) {
  if (query.isPending) return loading;
  const inaccessible =
    query.error instanceof ApiError &&
    [401, 403, 404, 410].includes(query.error.status);
  if (query.isError && (query.data === undefined || inaccessible)) {
    return (
      <ConnectionError
        error={query.error ?? new Error("Please try again.")}
        retry={() => {
          void query.refetch();
        }}
        pending={query.isFetching}
      />
    );
  }
  return (
    <>
      {query.isError && (
        <ConnectionError
          error={query.error ?? new Error("Please try again.")}
          retry={() => {
            void query.refetch();
          }}
          pending={query.isFetching}
        />
      )}
      {children}
    </>
  );
}

export function LoadMore({
  query,
  label = "Load more",
}: {
  label?: string;
  query: {
    hasNextPage?: boolean;
    isFetching: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
  };
}) {
  if (!query.hasNextPage) return null;
  return (
    <Button
      type="button"
      data-ui="button" variant="quiet" className="mt-4 [[data-ui~='delivery-history']_>_&]:mt-1 [[data-ui~='delivery-history']_>_&]:mb-4 [[data-ui~='delivery-history']_>_&]:mx-5"
      disabled={query.isFetching}
      onClick={() => {
        void query.fetchNextPage();
      }}
    >
      {query.isFetchingNextPage ? "Loading…" : label}
    </Button>
  );
}

export function RefreshButton({
  pending,
  refresh,
}: {
  pending: boolean;
  refresh: () => unknown;
}) {
  return (
    <Button
      type="button"
      data-ui="button" variant="quiet" size="small" className="leading-[1.4]"
      disabled={pending}
      onClick={() => {
        void refresh();
      }}
    >
      <ArrowClockwiseIcon size={16} aria-hidden="true" />
      {pending ? "Refreshing…" : "Refresh"}
    </Button>
  );
}
