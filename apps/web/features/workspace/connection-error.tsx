"use client";

import { ArrowClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { ApiError } from "@/lib/api";

const accessErrorTitles: Partial<Record<number, string>> = {
  401: "Session unavailable",
  403: "Access denied",
  404: "Resource unavailable",
  410: "Resource unavailable",
};

export function ConnectionError({
  error,
  retry,
  pending = false,
  title,
}: {
  error: Error;
  retry: () => void;
  pending?: boolean;
  title?: string;
}) {
  const status = error instanceof ApiError ? error.status : 0;
  const unavailable = status === 403 || status === 404 || status === 410;

  return (
    <div className="connection-error" role="alert">
      <WarningCircleIcon
        size={26}
        className="text-warning"
        aria-hidden="true"
      />
      <h2>
        {title ?? accessErrorTitles[status] ?? "Couldn't load your workspace"}
      </h2>
      <p>{error.message}</p>
      {unavailable ? (
        <Link href="/dashboard" className="button button-secondary">
          Back to projects
        </Link>
      ) : (
        <button
          type="button"
          className="button button-secondary"
          onClick={retry}
          disabled={pending}
        >
          <ArrowClockwiseIcon size={16} aria-hidden="true" />
          {pending ? "Retrying…" : "Try again"}
        </button>
      )}
    </div>
  );
}
