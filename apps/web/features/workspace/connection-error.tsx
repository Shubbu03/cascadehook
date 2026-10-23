"use client";

import { ArrowClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";

export function ConnectionError({
  error,
  retry,
  pending = false,
}: {
  error: Error;
  retry: () => void;
  pending?: boolean;
}) {
  return (
    <div className="connection-error" role="alert">
      <WarningCircleIcon
        size={26}
        className="text-warning"
        aria-hidden="true"
      />
      <h2>Let&apos;s get you reconnected.</h2>
      <p>{error.message}</p>
      <button
        type="button"
        className="button button-secondary"
        onClick={retry}
        disabled={pending}
      >
        <ArrowClockwiseIcon size={16} aria-hidden="true" />
        {pending ? "Reconnecting…" : "Try again"}
      </button>
    </div>
  );
}
