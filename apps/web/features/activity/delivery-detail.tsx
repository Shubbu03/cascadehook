"use client";

import { useAuth } from "@clerk/nextjs";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
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
import {
  projectPath,
  replayable,
  stateClass,
  stateLabel,
  type Attempt,
  type Delivery,
  type ReplayReceipt,
} from "./types";

export function DeliveryDetail({ deliveryId }: { deliveryId: string }) {
  const { project, canManage, suspended, availabilityKnown } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const search = useSearchParams();
  const [confirm, setConfirm] = useState<number | null>(null);
  const [cycle, setCycle] = useState<number | undefined>();
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
      notify("Replay queued for cycle " + receipt.cycle + ".", "success");
    },
    onError: (error) => {
      setConfirm(null);
      notify(error.message, "error");
    },
    onSettled: refresh,
  });
  const ready = Boolean(
    endpoint.isSuccess &&
      endpoint.data.enabled &&
      endpoint.data.verified_at &&
      endpoint.data.has_signing_secret,
  );
  const records = attempts.data?.pages.flatMap((page) => page.data) ?? [];

  function filterCycle(event: FormEvent<HTMLFormElement>) {
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
    <section>
      <Link
        href={
          href + "/deliveries" + (search.size ? "?" + search.toString() : "")
        }
        className="text-link workspace-muted"
      >
        ← Deliveries
      </Link>
      <QueryState query={detail}>
        {detail.data && (
          <>
            <PageHeader
              title="Delivery"
              description={<code>{deliveryId}</code>}
              actions={
                <RefreshButton
                  pending={detail.isFetching || attempts.isFetching}
                  refresh={refresh}
                />
              }
            />
            <dl className="detail-facts">
              <div>
                <dt>State</dt>
                <dd>
                  <span className={"status " + stateClass(detail.data.state)}>
                    {stateLabel(detail.data.state)}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Event</dt>
                <dd>
                  <Link
                    className="record-link mono"
                    href={href + "/events/" + detail.data.event_id}
                  >
                    {detail.data.event_id}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>Endpoint</dt>
                <dd>
                  <Link
                    className="record-link mono"
                    href={href + "/endpoints/" + detail.data.endpoint_id}
                  >
                    {endpoint.data?.url ?? detail.data.endpoint_id}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>Attempts / cycle</dt>
                <dd>
                  {detail.data.attempt_count} attempts · cycle{" "}
                  {detail.data.cycle}
                </dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatTime(detail.data.created_at)}</dd>
              </div>
              <div>
                <dt>Next attempt</dt>
                <dd>{formatTime(detail.data.next_attempt_at)}</dd>
              </div>
              <div>
                <dt>Retry deadline</dt>
                <dd>{formatTime(detail.data.retry_deadline)}</dd>
              </div>
              {detail.data.terminal_reason && (
                <div>
                  <dt>Terminal reason</dt>
                  <dd>
                    <code>{detail.data.terminal_reason}</code>
                  </dd>
                </div>
              )}
            </dl>
            {detail.data.active_attempt_id && (
              <p className="notice" role="status">
                Attempt in progress since{" "}
                {formatTime(detail.data.active_attempt_started_at)}. Completed
                results appear below.
              </p>
            )}
            <CopyButton
              value={deliveryId}
              label="Copy delivery ID"
              successMessage="Delivery ID copied."
            />
            {canManage && replayable(detail.data) && (
              <div className="replay-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={
                    replay.isPending ||
                    !availabilityKnown ||
                    suspended ||
                    !ready
                  }
                  onClick={() => {
                    replay.reset();
                    setConfirm(detail.data!.cycle);
                  }}
                >
                  Replay delivery
                </button>
                {!ready && (
                  <p className="field-help">
                    Replay requires an enabled, verified endpoint with a signing
                    secret.
                  </p>
                )}
                {endpoint.isError && (
                  <p role="alert" className="form-error">
                    {endpoint.error.message}{" "}
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        void endpoint.refetch();
                      }}
                    >
                      Check endpoint again
                    </button>
                  </p>
                )}
              </div>
            )}
            {replay.isError && (
              <p className="form-error" role="alert">
                {replay.error.message}
              </p>
            )}
            <div className="attempts-heading">
              <h3>Attempts</h3>
              <form className="activity-filters" onSubmit={filterCycle}>
                <label className="filter-field">
                  <span>Cycle</span>
                  <input
                    name="cycle"
                    type="number"
                    min="0"
                    max="2147483647"
                    placeholder="All cycles"
                  />
                </label>
                <button
                  type="submit"
                  className="button button-small button-secondary"
                >
                  Apply
                </button>
              </form>
            </div>
            {validation && (
              <p role="alert" className="form-error">
                {validation}
              </p>
            )}
            <QueryState query={attempts}>
              {records.length ? (
                <ol className="attempt-timeline" role="list">
                  {records.map((attempt) => (
                    <li key={attempt.id}>
                      <div className="attempt-record-heading">
                        <h4>
                          Attempt {attempt.attempt_number}{" "}
                          <span>· cycle {attempt.cycle}</span>
                        </h4>
                        <span
                          className={"status " + stateClass(attempt.outcome)}
                        >
                          {attempt.outcome}
                        </span>
                      </div>
                      <p className="workspace-muted">
                        {formatTime(attempt.started_at)} · {attempt.duration_ms}{" "}
                        ms ·{" "}
                        {attempt.status_code
                          ? "HTTP " + attempt.status_code
                          : "No HTTP response"}
                      </p>
                      {(attempt.error_code || attempt.terminal_reason) && (
                        <p className="attempt-error">
                          <code>
                            {attempt.error_code ?? attempt.terminal_reason}
                          </code>
                          {attempt.error_code && attempt.terminal_reason
                            ? " · " + attempt.terminal_reason
                            : ""}
                        </p>
                      )}
                      {attempt.retry_at && (
                        <p className="field-help">
                          Retry scheduled: {formatTime(attempt.retry_at)}
                        </p>
                      )}
                      {attempt.response_truncated && (
                        <p className="field-help">
                          Response exceeded the read limit.
                        </p>
                      )}
                      {attempt.response_read_error && (
                        <p className="field-help">
                          The response could not be read completely.
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="empty-state">
                  <h3>
                    No completed attempts
                    {cycle !== undefined ? " in this cycle" : ""}
                  </h3>
                </div>
              )}
              <LoadMore query={attempts} />
            </QueryState>
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
