"use client";

import Link from "next/link";
import { PublishEventForm } from "@/features/activity/publish-event-form";
import type { Endpoint } from "@/features/endpoints/types";

export function OverviewPublisher({
  endpoint,
  href,
  blockedReason,
}: {
  endpoint: Endpoint | undefined;
  href: string;
  blockedReason: string | undefined;
}) {
  const receiverReady = Boolean(
    endpoint?.has_signing_secret && endpoint.verified_at && endpoint.enabled,
  );
  const setupHref = !endpoint
    ? href + "/endpoints/new"
    : href +
      "/endpoints/" +
      encodeURIComponent(endpoint.id) +
      (receiverReady
        ? ""
        : !endpoint.has_signing_secret
          ? "#signing-secret"
          : "#receiver-verification");
  return (
    <section
      id="publish-event"
      className="overview-publish"
      aria-labelledby="publish-heading"
    >
      <div className="overview-section-heading">
        <h2 id="publish-heading">Publish a test event</h2>
      </div>
      {blockedReason || !endpoint ? (
        <div className="overview-waiting">
          <p>{blockedReason ?? "Register an endpoint to get started."}</p>
          <div className="form-actions">
            <Link href={setupHref} className="text-link">
              {receiverReady ? "View endpoint →" : "Continue setup →"}
            </Link>
            <Link
              href={href + "/receiver-guide"}
              className="text-link workspace-muted"
            >
              Receiver guide
            </Link>
          </div>
        </div>
      ) : (
        <PublishEventForm
          key={endpoint.id + ":" + endpoint.event_types.join(",")}
          initialType={endpoint.event_types[0]}
          eventTypes={endpoint.event_types}
        />
      )}
    </section>
  );
}
