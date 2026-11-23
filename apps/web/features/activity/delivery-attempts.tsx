"use client";


import { Status } from "@/components/status";
import {
  CaretDownIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { CopyButton } from "@/components/copy-button";
import { useFormatTime } from "@/lib/display-preferences";
import { stateTone, stateLabel, type Attempt } from "./types";

export function DeliveryAttempts({ records }: { records: Attempt[]; }) {
  const formatTime = useFormatTime();
  return (
    <ol className="list-none m-0 p-0 [&_>_li]:py-4 [&_>_li]:px-5 [&_>_li+li]:border-t [&_>_li+li]:border-t-border @max-[27.5rem]/delivery-detail:[&_>_li]:px-4" role="list">
      {records.map((attempt) => (
        <li key={attempt.id} data-outcome={attempt.outcome}>
          <div data-ui="delivery-attempt-heading" className="flex items-center flex-wrap gap-y-2 gap-x-2.5 [&_h3]:flex [&_h3]:items-baseline [&_h3]:flex-wrap [&_h3]:flex-1 [&_h3]:gap-y-1 [&_h3]:gap-x-2.5 [&_h3]:text-[13px] [&_h3]:font-medium [&_h3_>_span]:text-muted [&_h3_>_span]:text-[11px] [&_h3_>_span]:font-normal">
            <span className={"flex text-muted [[data-outcome=\"succeeded\"]_>_[data-ui~='delivery-attempt-heading']_&]:text-success [[data-outcome=\"terminal\"]_>_[data-ui~='delivery-attempt-heading']_&]:text-danger [[data-outcome=\"retryable\"]_>_[data-ui~='delivery-attempt-heading']_&]:text-warning"} aria-hidden="true">
              {attempt.outcome === "succeeded" ? (
                <CheckCircleIcon size={20} />
              ) : (
                <WarningCircleIcon size={20} />
              )}
            </span>
            <h3>
              Attempt {attempt.attempt_number}
              <span>Cycle {attempt.cycle}</span>
            </h3>
            <Status tone={stateTone(attempt.outcome)}>
              {attempt.outcome[0].toUpperCase() + attempt.outcome.slice(1)}
            </Status>
          </div>
          <div className="pl-7.5 @max-[27.5rem]/delivery-detail:pl-0">
            <div className="flex flex-wrap gap-y-1.25 gap-x-4 mt-1.5 text-muted text-[11px] leading-[1.7]">
              <time dateTime={attempt.started_at}>
                {formatTime(attempt.started_at)}
              </time>
              <span className="font-mono text-[10px]">
                {attempt.duration_ms.toLocaleString("en-US")} ms
              </span>
              <span className="font-mono text-[10px]">
                {attempt.status_code !== null
                  ? "HTTP " + attempt.status_code
                  : "No HTTP response"}
              </span>
            </div>
            {(attempt.error_code || attempt.terminal_reason) && (
              <p className="mt-1.75 text-danger text-[11px] wrap-anywhere">
                <code>{attempt.error_code ?? attempt.terminal_reason}</code>
                {attempt.error_code && attempt.terminal_reason
                  ? " · " + attempt.terminal_reason
                  : ""}
              </p>
            )}
            {attempt.retry_at && (
              <p className="mt-1.5 text-muted text-[11px] leading-[1.7]">
                Retry scheduled:{" "}
                <time dateTime={attempt.retry_at}>{formatTime(attempt.retry_at)}</time>
              </p>
            )}
            {attempt.response_truncated && (
              <p className="mt-1.5 text-muted text-[11px] leading-[1.7]">
                Response exceeded the read limit.
              </p>
            )}
            {attempt.response_read_error && (
              <p className="mt-1.5 text-muted text-[11px] leading-[1.7]">
                The response could not be read completely.
              </p>
            )}
            <details className="mt-2.5 [&_summary]:flex [&_summary]:items-center [&_summary]:w-fit [&_summary]:text-muted [&_summary]:text-[11px] [&_summary]:list-none [&_summary]:gap-1.5 [&_dl]:grid [&_dl]:grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] [&_dl]:gap-y-2.5 [&_dl]:gap-x-5 [&_dl]:mt-2.5 [&_dl]:mb-0 [&_dl]:rounded-md [&_dl]:bg-background [&_dl]:p-3 [&_dl]:mx-0 [&_dt]:text-muted [&_dt]:text-[10px] [&_dd]:mt-1 [&_dd]:mb-0 [&_dd]:text-[11px] [&_dd]:wrap-anywhere [&_dd]:mx-0 [&_summary::-webkit-details-marker]:hidden [&[open]_summary_>_svg]:transform-[rotate(180deg)] pointer-coarse:[&_summary]:min-h-11">
              <summary>
                Attempt details <CaretDownIcon size={12} aria-hidden="true" />
              </summary>
              <dl>
                <div>
                  <dt>Attempt ID</dt>
                  <dd data-ui="delivery-copy-value" className="flex items-center min-w-0 gap-1.5 [&_>_code]:min-w-0 [&_>_code]:wrap-anywhere [&_>_code]:text-[11px]">
                    <code>{attempt.id}</code>
                    <CopyButton
                      value={attempt.id}
                      label="Copy attempt ID"
                      successMessage="Attempt ID copied."
                      iconOnly
                    />
                  </dd>
                </div>
                <div>
                  <dt>Finished</dt>
                  <dd>
                    <time dateTime={attempt.finished_at}>
                      {formatTime(attempt.finished_at)}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Recorded delivery state</dt>
                  <dd>{stateLabel(attempt.delivery_state)}</dd>
                </div>
              </dl>
            </details>
          </div>
        </li>
      ))}
    </ol>
  );
}
