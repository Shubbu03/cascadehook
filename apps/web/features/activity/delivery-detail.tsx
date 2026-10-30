"use client";

import { PageSkeleton, AttemptsSkeleton } from "@/features/workspace/skeletons";
import { useAuth } from "@clerk/nextjs";
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useState, type SubmitEvent } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { LoadMore, QueryState, RefreshButton } from "@/components/query-state";
import {
  endpointKeys,
  endpointPath,
  type Endpoint,
} from "@/features/endpoints/types";
import { useProject, projectHref } from "@/features/projects/project-workspace";
import { useSessionUserId } from "@/features/workspace/session";
import type { Page } from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { DeliveryAttempts } from "./delivery-attempts";
import { DeliveryContext } from "./delivery-context";
import {
  projectPath,
  replayable,
  type Attempt,
  type Delivery,
  type ReplayReceipt,
} from "./types";

const resultCopy: Record<Delivery["state"], { title: string; description: string }> = {
  pending: {
    title: "Waiting to deliver",
    description: "Queued for the next delivery attempt.",
  },
  leased: {
    title: "Delivery in progress",
    description: "A worker is processing this delivery. Results update automatically.",
  },
  succeeded: {
    title: "Delivered successfully",
    description: "The receiver accepted this delivery in its current cycle.",
  },
  failed: {
    title: "Delivery failed",
    description: "This retry cycle has ended. Review the attempts before replaying.",
  },
  canceled: {
    title: "Delivery canceled",
    description: "This delivery was canceled. Its attempt history is preserved.",
  },
};

export function DeliveryDetail({ deliveryId }: { deliveryId: string }) {
  const { project, canManage, suspended, availabilityKnown } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const search = useSearchParams();
  const [confirm, setConfirm] = useState<number | null>(null);
  const [cycle, setCycle] = useState<number | undefined>();
  const [cycleInput, setCycleInput] = useState("");
  const cycleFilterId = useId();
  const [validation, setValidation] = useState("");
  const href = projectHref(project.id);
  const path = projectPath(
    project.id,
    "deliveries/" + encodeURIComponent(deliveryId),
  );
  const key = ["delivery", userId, project.id, deliveryId];
  const detail = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiRequest<Delivery>(path, getToken, { signal }),
    staleTime: 0,
    refetchInterval: (query) =>
      ["pending", "leased"].includes(query.state.data?.state ?? "")
        ? 5000
        : false,
  });
  const endpoint = useQuery({
    queryKey: endpointKeys.detail(
      userId,
      project.id,
      detail.data?.endpoint_id ?? "",
    ),
    enabled: Boolean(detail.data?.endpoint_id),
    queryFn: ({ signal }) =>
      apiRequest<Endpoint>(
        endpointPath(project.id, detail.data!.endpoint_id),
        getToken,
        { signal },
      ),
    staleTime: 0,
  });
  const attempts = useInfiniteQuery({
    queryKey: ["attempts", userId, project.id, deliveryId, cycle],
    enabled: detail.isSuccess,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiRequest<Page<Attempt>>(path + "/attempts", getToken, {
        signal,
        params: {
          limit: 20,
          ...(cycle !== undefined ? { cycle } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchInterval:
      detail.data && ["pending", "leased"].includes(detail.data.state)
        ? 5000
        : false,
  });
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({
        queryKey: ["attempts", userId, project.id, deliveryId],
      }),
      client.invalidateQueries({
        queryKey: ["deliveries", userId, project.id],
      }),
      ...(detail.data
        ? [
            client.invalidateQueries({
              queryKey: endpointKeys.detail(
                userId,
                project.id,
                detail.data.endpoint_id,
              ),
            }),
          ]
        : []),
    ]);
  }
  const replay = useMutation({
    mutationFn: (expected_cycle: number) =>
      apiRequest<ReplayReceipt>(path + "/replay", getToken, {
        method: "POST",
        data: { expected_cycle },
      }),
    onSuccess: (receipt) => {
      setConfirm(null);
      setCycle(undefined);
      setCycleInput("");
      setValidation("");
      notify("Replay queued for cycle " + receipt.cycle + ".", "success");
    },
    onError: (error) => {
      setConfirm(null);
      notify(error.message, "error");
    },
    onSettled: refresh,
  });
  const replayBlock = !availabilityKnown
    ? "Project availability must be checked before replaying."
    : suspended
      ? "Replay is unavailable while this project is paused."
      : endpoint.isPending
        ? "Checking endpoint readiness…"
        : endpoint.isError
          ? "Endpoint readiness could not be checked."
          : !endpoint.data?.has_signing_secret
            ? "Configure the endpoint’s signing secret before replaying."
            : !endpoint.data.verified_at
              ? "Verify the receiver before replaying."
              : !endpoint.data.enabled
                ? "Enable delivery on this endpoint before replaying."
                : undefined;
  const currentEndpoint = endpoint.isSuccess ? endpoint.data : undefined;
  const records = attempts.data?.pages.flatMap((page) => page.data) ?? [];

  function filterCycle(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(
      new FormData(event.currentTarget).get("cycle") ?? "",
    ).trim();
    if (value && (!/^\d+$/.test(value) || Number(value) > 2147483647)) {
      setValidation("Enter a non-negative cycle number.");
      return;
    }
    setValidation("");
    setCycle(value ? Number(value) : undefined);
  }

  return (
    <section className="delivery-detail" aria-labelledby="delivery-title">
      <Link
        href={href + "/deliveries" + (search.size ? "?" + search.toString() : "")}
        className="text-link workspace-muted"
      >
        <ArrowLeftIcon size={15} aria-hidden="true" />
        Deliveries
      </Link>
      <QueryState query={detail} loading={<PageSkeleton variant="delivery" />}>
        {detail.data && (
          <>
            <PageHeader
              title="Delivery"
              titleId="delivery-title"
              description={
                <div className="delivery-identifier">
                  <code>{deliveryId}</code>
                  <CopyButton
                    value={deliveryId}
                    label="Copy delivery ID"
                    successMessage="Delivery ID copied."
                    iconOnly
                  />
                </div>
              }
              actions={
                <>
                  <RefreshButton
                    pending={
                      detail.isFetching || attempts.isFetching || endpoint.isFetching
                    }
                    refresh={refresh}
                  />
                  {canManage && replayable(detail.data) && (
                    <button
                      type="button"
                      className="button button-small button-secondary"
                      disabled={replay.isPending || Boolean(replayBlock)}
                      aria-describedby={
                        replayBlock ? "delivery-replay-note" : undefined
                      }
                      onClick={() => {
                        replay.reset();
                        setConfirm(detail.data!.cycle);
                      }}
                    >
                      <ArrowClockwiseIcon size={16} aria-hidden="true" />
                      {replay.isPending ? "Queuing replay…" : "Replay delivery"}
                    </button>
                  )}
                </>
              }
            />
            <section
              className="delivery-result"
              data-state={detail.data.state}
              aria-labelledby="delivery-result-title"
            >
              <div className="delivery-result-copy">
                <span className="delivery-result-icon" aria-hidden="true">
                  {detail.data.state === "succeeded" ? (
                    <CheckCircleIcon size={25} />
                  ) : detail.data.state === "failed" ? (
                    <WarningCircleIcon size={25} />
                  ) : detail.data.state === "canceled" ? (
                    <XCircleIcon size={25} />
                  ) : (
                    <ClockIcon size={25} />
                  )}
                </span>
                <div>
                  <h2 id="delivery-result-title">
                    {resultCopy[detail.data.state].title}
                  </h2>
                  <p>{resultCopy[detail.data.state].description}</p>
                  {detail.data.terminal_reason && (
                    <code className="delivery-terminal-reason">
                      {detail.data.terminal_reason}
                    </code>
                  )}
                </div>
              </div>
              <dl className="delivery-result-stats">
                <div>
                  <dt>Current cycle</dt><dd>{detail.data.cycle}</dd>
                </div>
                <div>
                  <dt>Attempts in cycle</dt><dd>{detail.data.attempt_count}</dd>
                </div>
              </dl>
            </section>
            {canManage && replayable(detail.data) && replayBlock && (
              <div
                className="delivery-replay-note"
                id="delivery-replay-note"
                role="status"
              >
                <p>{replayBlock}</p>
                {endpoint.isError ? (
                  <button
                    type="button"
                    className="text-link"
                    disabled={endpoint.isFetching}
                    onClick={() => { void endpoint.refetch(); }}
                  >
                    Check endpoint again
                    <ArrowClockwiseIcon size={13} aria-hidden="true" />
                  </button>
                ) : currentEndpoint && !suspended && availabilityKnown && (
                  <Link
                    className="text-link"
                    href={href + "/endpoints/" + detail.data.endpoint_id}
                  >
                    Endpoint settings <ArrowRightIcon size={13} aria-hidden="true" />
                  </Link>
                )}
              </div>
            )}
            {replay.isError && (
              <p className="form-error" role="alert">{replay.error.message}</p>
            )}
            <div className="delivery-workspace">
              <section
                className="delivery-history"
                aria-labelledby="delivery-attempts-title"
              >
                <div className="delivery-history-heading">
                  <div>
                    <h2 id="delivery-attempts-title">Attempt history</h2>
                    <p>
                      {cycle === undefined ? "All cycles" : "Cycle " + cycle}
                      {" · Newest first"}
                    </p>
                  </div>
                  <form
                    className="delivery-cycle-filter"
                    onSubmit={filterCycle}
                    noValidate
                  >
                    <label htmlFor={cycleFilterId}>Cycle</label>
                    <input
                      id={cycleFilterId}
                      name="cycle"
                      type="text"
                      inputMode="numeric"
                      maxLength={10}
                      value={cycleInput}
                      onChange={(event) => setCycleInput(event.target.value)}
                      placeholder="All cycles"
                      aria-invalid={Boolean(validation)}
                      aria-describedby={
                        validation ? cycleFilterId + "-error" : undefined
                      }
                    />
                    <button
                      type="submit"
                      className="button button-small button-secondary"
                    >
                      Apply
                    </button>
                    {cycle !== undefined && (
                      <button
                        type="button"
                        className="button button-small button-quiet"
                        onClick={() => {
                          setCycle(undefined);
                          setCycleInput("");
                          setValidation("");
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </form>
                </div>
                {validation && (
                  <p
                    id={cycleFilterId + "-error"}
                    role="alert"
                    className="form-error"
                  >
                    {validation}
                  </p>
                )}
                {detail.data.active_attempt_id && (cycle === undefined || cycle === detail.data.cycle) && (
                  <div className="delivery-inflight" role="status">
                    <ClockIcon size={18} aria-hidden="true" />
                    <div>
                      <h3>
                        Attempt {detail.data.attempt_count} in progress · Cycle {detail.data.cycle}
                      </h3>
                      <p>
                        Started {formatTime(detail.data.active_attempt_started_at)}.
                        Waiting for a completed result.
                      </p>
                    </div>
                  </div>
                )}
                <QueryState query={attempts} loading={<AttemptsSkeleton />}>
                  {records.length ? (
                    <DeliveryAttempts records={records} />
                  ) : (
                    <div className="delivery-history-empty">
                      <ClockIcon size={25} aria-hidden="true" />
                      <h3>
                        No completed attempts{cycle !== undefined ? " in this cycle" : " yet"}
                      </h3>
                      <p>
                        {detail.data.active_attempt_id &&
                        (cycle === undefined || cycle === detail.data.cycle)
                          ? "The current request is still in progress."
                          : "Completed request results will appear here."}
                      </p>
                    </div>
                  )}
                  <LoadMore query={attempts} label="Load more attempts" />
                </QueryState>
              </section>
              <DeliveryContext
                delivery={detail.data}
                endpoint={currentEndpoint}
                unavailable={endpoint.isError}
                loading={endpoint.isPending}
                href={href}
              />
            </div>
          </>
        )}
      </QueryState>
      {confirm !== null && (
        <ConfirmDialog
          title="Replay this delivery?"
          confirmLabel="Queue replay"
          pending={replay.isPending}
          onConfirm={() => replay.mutate(confirm)}
          onCancel={() => setConfirm(null)}
        >
          <p>
            This starts a new retry cycle and can deliver the same event again.
            Previous attempts remain available.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
