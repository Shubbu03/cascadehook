import { ArrowRightIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { Skeleton, SkeletonRegion } from "@/components/skeleton";
import { endpointState, type Endpoint } from "@/features/endpoints/types";
import { formatTime } from "@/lib/format";
import type { Delivery } from "./types";

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
  const timing = [
    ["Created", delivery.created_at],
    ["Cycle started", delivery.cycle_started_at],
    ["Last updated", delivery.updated_at],
    ...(delivery.next_attempt_at ? [["Next attempt", delivery.next_attempt_at]] : []),
    ["Retry deadline", delivery.retry_deadline],
  ];

  return (
    <aside className="delivery-context" aria-label="Delivery details">
      <section
        className="delivery-context-section"
        aria-labelledby="delivery-endpoint-title"
      >
        <div className="delivery-context-heading">
          <h2 id="delivery-endpoint-title">Endpoint</h2>
          {endpoint && (
            <span
              className={"status " + (endpoint.enabled ? "status-success" : "status-neutral")}
            >
              {endpointState(endpoint)}
            </span>
          )}
        </div>
        {loading ? (
          <SkeletonRegion label="Loading endpoint…" className="skeleton-endpoint-context">
            <div className="skeleton-stack">
              <Skeleton width="95%" height={12} />
              <Skeleton width="80%" height={12} />
              <Skeleton width="65%" height={10} />
            </div>
          </SkeletonRegion>
        ) : (
        <Link
          className="record-link mono delivery-destination"
          href={href + "/endpoints/" + delivery.endpoint_id}
        >
          {endpoint?.url ?? delivery.endpoint_id}
          <ArrowRightIcon size={13} aria-hidden="true" />
        </Link>
        )}
        {endpoint && (
          <div className="delivery-copy-value delivery-endpoint-id">
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
          <p className="delivery-context-note">Current endpoint details are unavailable.</p>
        )}
      </section>
      <section
        className="delivery-context-section"
        aria-labelledby="delivery-event-title"
      >
        <h2 id="delivery-event-title">Event</h2>
        <div className="delivery-copy-value">
          <Link className="record-link mono" href={href + "/events/" + delivery.event_id}>
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
          className="text-link delivery-view-event"
        >
          View event and payload <ArrowRightIcon size={13} aria-hidden="true" />
        </Link>
      </section>
      <section
        className="delivery-context-section"
        aria-labelledby="delivery-timing-title"
      >
        <h2 id="delivery-timing-title">Timing</h2>
        <dl className="delivery-timing">
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
