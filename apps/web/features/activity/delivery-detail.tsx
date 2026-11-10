"use client";

import { Input } from "@/components/input";

import { Button } from "@/components/button";

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
import { useFormatTime } from "@/lib/display-preferences";
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

const resultCopy: Record<Delivery["state"], { title: string; description: string; }> = {
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

export function DeliveryDetail({ deliveryId }: { deliveryId: string; }) {
  const formatTime = useFormatTime();
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
    <section data-ui="delivery-detail" className="max-w-300 [container:delivery-detail/inline-size]" aria-labelledby="delivery-title">
      <Link
        href={href + "/deliveries" + (search.size ? "?" + search.toString() : "")}
        className="inline-flex items-center font-medium text-muted gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent text-[12px] in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_[data-ui~='delivery-detail']_>_&:first-child]:mb-3 max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]"
      >
        <ArrowLeftIcon size={15} aria-hidden="true" />
        Deliveries
      </Link>
      <QueryState query={detail} loading={<PageSkeleton variant="delivery" />}>
        {detail.data && (
          <>
            <PageHeader variant="delivery"
              title="Delivery"
              titleId="delivery-title"
              description={
                <div data-ui="delivery-identifier" className="flex items-center min-w-0 gap-1.5 [&_>_code]:min-w-0 [&_>_code]:wrap-anywhere [&_>_code]:text-[11px]">
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
                    <Button
                      type="button"
                      data-ui="button" variant="secondary" size="small" className="leading-[1.4]"
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
                    </Button>
                  )}
                </>
              }
            />
            <section
              className={"[--result-color:var(--muted)] [--result-background:var(--surface-hover)] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-y-5 gap-x-8 mb-4 rounded-[9px] bg-surface py-4.5 px-5 border border-solid border-border [&_h2]:text-[16px] [&_h2]:font-medium [&_h2]:tracking-[-0.02em] data-[state=\"succeeded\"]:[--result-color:var(--success)] data-[state=\"succeeded\"]:[--result-background:var(--success-subtle)] data-[state=\"failed\"]:[--result-color:var(--danger)] data-[state=\"failed\"]:[--result-background:var(--danger-subtle)] [[data-state=\"pending\"],[data-state=\"leased\"]]:[--result-color:var(--warning)] [[data-state=\"pending\"],[data-state=\"leased\"]]:[--result-background:var(--warning-subtle)] @max-[37.5rem]/delivery-detail:grid-cols-[1fr] @max-[37.5rem]/delivery-detail:gap-4"}
              data-state={detail.data.state}
              aria-labelledby="delivery-result-title"
            >
              <div className="flex items-start min-w-0 gap-3 [&_p]:mt-1 [&_p]:text-muted [&_p]:text-[12px] [&_p]:leading-[1.7]">
                <span className="grid place-items-center flex-[0_0_42px] h-10.5 rounded-full text-(--result-color) bg-(--result-background)" aria-hidden="true">
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
                    <code className="block mt-1.5 text-(--result-color) text-[11px] wrap-anywhere">
                      {detail.data.terminal_reason}
                    </code>
                  )}
                </div>
              </div>
              <dl className="flex pl-7 border-l [border-left-style:solid] border-l-border gap-7 m-0 [&_dt]:text-muted [&_dt]:text-[11px] [&_dd]:mt-0.75 [&_dd]:mb-0 [&_dd]:tabular-nums [&_dd]:mx-0 [&_dd]:text-2xl/tight @max-[37.5rem]/delivery-detail:pt-3 @max-[37.5rem]/delivery-detail:pb-0 @max-[37.5rem]/delivery-detail:border-t @max-[37.5rem]/delivery-detail:[border-top-style:solid] @max-[37.5rem]/delivery-detail:border-t-border @max-[37.5rem]/delivery-detail:border-l-0 @max-[37.5rem]/delivery-detail:[border-left-style:none] @max-[37.5rem]/delivery-detail:border-l-[currentColor] @max-[37.5rem]/delivery-detail:gap-7 @max-[37.5rem]/delivery-detail:px-0">
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
                className="flex items-center justify-between flex-wrap gap-y-2 gap-x-5 mb-4 rounded-[7px] text-muted text-[12px] leading-[1.65] py-2.5 px-3.5 border border-solid border-border"
                id="delivery-replay-note"
                role="status"
              >
                <p>{replayBlock}</p>
                {endpoint.isError ? (
                  <button
                    type="button"
                    className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent text-[12px] in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_[data-ui~='delivery-detail']_>_&:first-child]:mb-3 max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]"
                    disabled={endpoint.isFetching}
                    onClick={() => { void endpoint.refetch(); }}
                  >
                    Check endpoint again
                    <ArrowClockwiseIcon size={13} aria-hidden="true" />
                  </button>
                ) : currentEndpoint && !suspended && availabilityKnown && (
                  <Link
                    className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent text-[12px] in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_[data-ui~='delivery-detail']_>_&:first-child]:mb-3 max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]"
                    href={href + "/endpoints/" + detail.data.endpoint_id}
                  >
                    Endpoint settings <ArrowRightIcon size={13} aria-hidden="true" />
                  </Link>
                )}
              </div>
            )}
            {replay.isError && (
              <p className="text-danger text-[13px] my-3 [[data-ui~='delivery-history']_>_&]:my-3 [[data-ui~='delivery-history']_>_&]:mx-5" role="alert">{replay.error.message}</p>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-5 @max-[55rem]/delivery-detail:grid-cols-[1fr]">
              <section
                data-ui="delivery-history" className="min-w-0 rounded-[9px] bg-surface border border-solid border-border [&_h2]:text-[14px] [&_h2]:font-medium [&_h2]:tracking-[-0.01em]"
                aria-labelledby="delivery-attempts-title"
              >
                <div className="flex items-center justify-between flex-wrap gap-y-3 gap-x-5 border-b [border-bottom-style:solid] border-b-border py-4 px-5 [&_p]:mt-1 [&_p]:text-muted [&_p]:text-[11px] @max-[27.5rem]/delivery-detail:px-4">
                  <div>
                    <h2 id="delivery-attempts-title">Attempt history</h2>
                    <p>
                      {cycle === undefined ? "All cycles" : "Cycle " + cycle}
                      {" · Newest first"}
                    </p>
                  </div>
                  <form
                    className="flex items-center flex-wrap min-w-0 gap-2 [&_label]:text-muted [&_label]:text-[11px] @max-[37.5rem]/delivery-detail:w-full"
                    onSubmit={filterCycle}
                    noValidate
                  >
                    <label htmlFor={cycleFilterId}>Cycle</label>
                    <Input className="w-27 min-w-0 min-h-9 rounded-[5px] text-foreground text-[12px] py-1.75 px-2.25 @max-[37.5rem]/delivery-detail:flex-1 @max-[27.5rem]/delivery-detail:text-[16px]"
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
                    <Button
                      type="submit"
                      data-ui="button" variant="secondary" size="small" className="leading-[1.4]"
                    >
                      Apply
                    </Button>
                    {cycle !== undefined && (
                      <Button
                        type="button"
                        data-ui="button" variant="quiet" size="small" className="leading-[1.4]"
                        onClick={() => {
                          setCycle(undefined);
                          setCycleInput("");
                          setValidation("");
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </form>
                </div>
                {validation && (
                  <p
                    id={cycleFilterId + "-error"}
                    role="alert"
                    className="text-danger text-[13px] my-3 [[data-ui~='delivery-history']_>_&]:my-3 [[data-ui~='delivery-history']_>_&]:mx-5"
                  >
                    {validation}
                  </p>
                )}
                {detail.data.active_attempt_id && (cycle === undefined || cycle === detail.data.cycle) && (
                  <div className="flex items-start border-b [border-bottom-style:solid] border-b-border bg-warning-subtle gap-2.5 py-4 px-5 [&_>_svg]:shrink-0 [&_>_svg]:mt-0.5 [&_>_svg]:text-warning [&_h3]:text-[13px] [&_h3]:font-medium [&_p]:mt-1 [&_p]:text-muted [&_p]:text-[11px] [&_p]:leading-[1.7]" role="status">
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
                    <div className="grid justify-items-center text-center text-muted gap-2 py-9 px-5 [&_h3]:text-foreground [&_h3]:text-[14px] [&_h3]:font-medium [&_p]:text-[12px] [&_p]:leading-[1.7]">
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
