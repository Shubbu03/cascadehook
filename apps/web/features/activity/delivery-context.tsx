"use client";


import { Status } from "@/components/status";
import { ArrowRightIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { Skeleton, SkeletonRegion } from "@/components/skeleton";
import { endpointState, type Endpoint } from "@/features/endpoints/types";
import { useFormatTime } from "@/lib/display-preferences";
import type { Delivery } from "./types";

const contextSection =
  "min-w-0 py-4.5 px-5 [[data-ui~='delivery-context-section']+&]:border-t [[data-ui~='delivery-context-section']+&]:[border-top-style:solid] [[data-ui~='delivery-context-section']+&]:border-t-border @max-[27.5rem]/delivery-detail:px-4 @max-[55rem]/delivery-detail:[[data-ui~='delivery-context-section']+&]:border-t-0 @max-[55rem]/delivery-detail:[[data-ui~='delivery-context-section']+&]:border-l @max-[55rem]/delivery-detail:[[data-ui~='delivery-context-section']+&]:[border-left-style:solid] @max-[55rem]/delivery-detail:[[data-ui~='delivery-context-section']+&]:border-l-border @max-[55rem]/delivery-detail:last:col-span-full @max-[55rem]/delivery-detail:last:border-t @max-[55rem]/delivery-detail:last:[border-top-style:solid] @max-[55rem]/delivery-detail:last:border-t-border @max-[55rem]/delivery-detail:last:border-l-0 @max-[37.5rem]/delivery-detail:[[data-ui~='delivery-context-section']+&]:border-t @max-[37.5rem]/delivery-detail:[[data-ui~='delivery-context-section']+&]:[border-top-style:solid] @max-[37.5rem]/delivery-detail:[[data-ui~='delivery-context-section']+&]:border-t-border @max-[37.5rem]/delivery-detail:[[data-ui~='delivery-context-section']+&]:border-l-0";

export function DeliveryContext({
  delivery,
  endpoint,
  unavailable,
  loading,
  href,
}: {
  delivery: Delivery;
  endpoint: Endpoint | undefined;
  unavailable: boolean;
  loading: boolean;
  href: string;
}) {
  const formatTime = useFormatTime();
  const timing = [
    ["Created", delivery.created_at],
    ["Cycle started", delivery.cycle_started_at],
    ["Last updated", delivery.updated_at],
    ...(delivery.next_attempt_at ? [["Next attempt", delivery.next_attempt_at]] : []),
    ["Retry deadline", delivery.retry_deadline],
  ];

  return (
    <aside data-ui="delivery-context" className="min-w-0 rounded-[9px] bg-surface border border-solid border-border [&_h2]:text-[14px] [&_h2]:font-medium [&_h2]:tracking-[-0.01em] @max-[55rem]/delivery-detail:grid @max-[55rem]/delivery-detail:grid-cols-2 @max-[37.5rem]/delivery-detail:grid-cols-[1fr]" aria-label="Delivery details">
      <section
        data-ui="delivery-context-section" className={contextSection}
        aria-labelledby="delivery-endpoint-title"
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 id="delivery-endpoint-title">Endpoint</h2>
          {endpoint && (
            <Status
              tone={(endpoint.enabled ? "success" : "neutral")}
            >
              {endpointState(endpoint)}
            </Status>
          )}
        </div>
        {loading ? (
          <SkeletonRegion label="Loading endpoint…" className="mt-3">
            <div className="grid min-w-0 gap-2.5">
              <Skeleton width="95%" height={12} />
              <Skeleton width="80%" height={12} />
              <Skeleton width="65%" height={10} />
            </div>
          </SkeletonRegion>
        ) : (
          <Link
            className="font-mono text-accent underline decoration-transparent underline-offset-[3px] wrap-anywhere block mt-2.5 text-[12px] leading-[1.8] [&_>_svg]:inline [&_>_svg]:ml-1.25 [&_>_svg]:align-middle [&:hover]:decoration-current"
            href={href + "/endpoints/" + delivery.endpoint_id}
          >
            {endpoint?.url ?? delivery.endpoint_id}
            <ArrowRightIcon size={13} aria-hidden="true" />
          </Link>
        )}
        {endpoint && (
          <div data-ui="delivery-copy-value" className="flex items-center min-w-0 mt-2 text-muted gap-1.5 [&_>_code]:min-w-0 [&_>_code]:wrap-anywhere [&_>_code]:text-[10px] [[data-ui~='delivery-context-section']_>_&]:mt-2">
            <code>{endpoint.id}</code>
            <CopyButton
              value={endpoint.id}
              label="Copy endpoint ID"
              successMessage="Endpoint ID copied."
              iconOnly
            />
          </div>
        )}
        {unavailable && (
          <p className="mt-2 text-muted text-[11px] leading-[1.7]">Current endpoint details are unavailable.</p>
        )}
      </section>
      <section
        data-ui="delivery-context-section" className={contextSection}
        aria-labelledby="delivery-event-title"
      >
        <h2 id="delivery-event-title">Event</h2>
        <div data-ui="delivery-copy-value" className="flex items-center min-w-0 gap-1.5 [&_>_code]:min-w-0 [&_>_code]:wrap-anywhere [&_>_code]:text-[11px] [[data-ui~='delivery-context-section']_>_&]:mt-2">
          <Link className="font-mono text-accent underline decoration-transparent underline-offset-[3px] wrap-anywhere [&:hover]:decoration-current [[data-ui~='delivery-copy-value']_>_&]:min-w-0 [[data-ui~='delivery-copy-value']_>_&]:wrap-anywhere [[data-ui~='delivery-copy-value']_>_&]:text-[11px]" href={href + "/events/" + delivery.event_id}>
            {delivery.event_id}
          </Link>
          <CopyButton
            value={delivery.event_id}
            label="Copy event ID"
            successMessage="Event ID copied."
            iconOnly
          />
        </div>
        <Link
          href={href + "/events/" + delivery.event_id}
          className="inline-flex items-center text-[14px] font-medium mt-2.5 gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='delivery-detail']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_[data-ui~='delivery-detail']_>_&:first-child]:mb-3"
        >
          View event and payload <ArrowRightIcon size={13} aria-hidden="true" />
        </Link>
      </section>
      <section
        data-ui="delivery-context-section" className={contextSection}
        aria-labelledby="delivery-timing-title"
      >
        <h2 id="delivery-timing-title">Timing</h2>
        <dl className="grid mt-3 mb-0 gap-3 mx-0 [&_>_div]:grid [&_>_div]:grid-cols-[82px_minmax(0,1fr)] [&_>_div]:gap-2 [&_dt]:text-muted [&_dt]:text-[11px] [&_dd]:text-right [&_dd]:text-[11px] [&_dd]:leading-[1.7] [&_dd]:m-0 @max-[55rem]/delivery-detail:grid-cols-2 @max-[55rem]/delivery-detail:gap-y-3 @max-[55rem]/delivery-detail:gap-x-7 @max-[37.5rem]/delivery-detail:grid-cols-[1fr]">
          {timing.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd><time dateTime={value}>{formatTime(value)}</time></dd>
            </div>
          ))}
        </dl>
      </section>
    </aside>
  );
}
