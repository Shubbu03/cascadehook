"use client";

import Link from "next/link";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import type { Endpoint } from "@/features/endpoints/types";
import { setupCommand } from "./setup";

export function PublishExample({
  endpoint,
  href,
  blockedReason,
}: {
  endpoint: Endpoint | undefined;
  href: string;
  blockedReason: string | undefined;
}) {
  const [requestKey, setRequestKey] = useState("");
  const type = endpoint?.event_types[0];
  const origin = process.env.NEXT_PUBLIC_API_BASE_URL;
  const command =
    endpoint && type && origin
      ? setupCommand(
          origin,
          type,
          requestKey || "setup-" + endpoint.id + "-" + type,
        )
      : "";
  return (
    <section
      id="publish-event"
      className="overview-publish"
      aria-labelledby="publish-heading"
    >
      <div className="overview-section-heading">
        <h2 id="publish-heading">Publish your first event</h2>
      </div>
      {blockedReason || !command ? (
        <div className="overview-waiting">
          <p>
            {blockedReason ??
              "The publish command is unavailable. Check the API connection and endpoint subscriptions."}
          </p>
          <Link href={href + "/receiver-guide"} className="text-link">
            Receiver guide →
          </Link>
        </div>
      ) : (
        <>
          <p className="field-help">
            Replace YOUR_PROJECT_API_KEY with the key you saved. This event uses{" "}
            <code>{type}</code>.
          </p>
          <div className="overview-command">
            <div className="overview-command-heading">
              <span>Terminal</span>
              <CopyButton value={command} label="Copy command" />
            </div>
            <pre>
              <code>{command}</code>
            </pre>
          </div>
          <div className="overview-command-note">
            <p className="field-help">
              Reuse this command when retrying. Use a new event key to publish
              again.
            </p>
            <button
              type="button"
              className="text-link"
              onClick={() => setRequestKey("setup-" + crypto.randomUUID())}
            >
              Use a new event
            </button>
          </div>
          <p className="field-help">
            A 202 response confirms acceptance. The delivery result appears
            below.
          </p>
        </>
      )}
    </section>
  );
}
