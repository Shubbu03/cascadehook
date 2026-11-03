"use client";

import { Button, buttonStyles } from "@/components/button";

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
    <div data-ui="connection-error" className="grid rounded-[10px] bg-surface gap-3.5 p-6.5 border border-solid border-border [&_h2]:text-[21px] [&_p]:text-[14px] [&_p]:text-muted [&_p]:max-w-120 in-data-[ui~='project-overview']:my-3" role="alert">
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
        <Link href="/dashboard" data-ui="button" className={buttonStyles({ variant: "secondary", className: "justify-self-start" })}>
          Back to projects
        </Link>
      ) : (
        <Button
          type="button"
          data-ui="button" variant="secondary" className="justify-self-start"
          onClick={retry}
          disabled={pending}
        >
          <ArrowClockwiseIcon size={16} aria-hidden="true" />
          {pending ? "Retrying…" : "Try again"}
        </Button>
      )}
    </div>
  );
}
