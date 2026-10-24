"use client";

import { ArrowClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";

export function ConnectionError({
  error,
  retry,
  pending = false,
  title = "Let's get you reconnected.",
}: {
  error: Error;
  retry: () => void;
  pending?: boolean;
  title?: string;
}) {
  return (
    <div className="connection-error" role="alert">
      <WarningCircleIcon
        size={26}
        className="text-warning"
        aria-hidden="true"
      />
      <h2>{title}</h2>
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
