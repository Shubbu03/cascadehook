import {
  CaretDownIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { CopyButton } from "@/components/copy-button";
import { formatTime } from "@/lib/format";
import { stateClass, stateLabel, type Attempt } from "./types";

export function DeliveryAttempts({ records }: { records: Attempt[] }) {
  return (
    <ol className="delivery-attempt-list" role="list">
      {records.map((attempt) => (
        <li key={attempt.id} data-outcome={attempt.outcome}>
          <div className="delivery-attempt-heading">
            <span className="delivery-attempt-icon" aria-hidden="true">
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
            <span className={"status " + stateClass(attempt.outcome)}>
              {attempt.outcome[0].toUpperCase() + attempt.outcome.slice(1)}
            </span>
          </div>
          <div className="delivery-attempt-body">
            <div className="delivery-attempt-facts">
              <time dateTime={attempt.started_at}>
                {formatTime(attempt.started_at)}
              </time>
              <span className="mono">
                {attempt.duration_ms.toLocaleString("en-US")} ms
              </span>
              <span className="mono">
                {attempt.status_code !== null
                  ? "HTTP " + attempt.status_code
                  : "No HTTP response"}
              </span>
            </div>
            {(attempt.error_code || attempt.terminal_reason) && (
              <p className="delivery-attempt-error">
                <code>{attempt.error_code ?? attempt.terminal_reason}</code>
                {attempt.error_code && attempt.terminal_reason
                  ? " · " + attempt.terminal_reason
                  : ""}
              </p>
            )}
            {attempt.retry_at && (
              <p className="delivery-attempt-note">
                Retry scheduled:{" "}
                <time dateTime={attempt.retry_at}>{formatTime(attempt.retry_at)}</time>
              </p>
            )}
            {attempt.response_truncated && (
              <p className="delivery-attempt-note">
                Response exceeded the read limit.
              </p>
            )}
            {attempt.response_read_error && (
              <p className="delivery-attempt-note">
                The response could not be read completely.
              </p>
            )}
            <details className="delivery-attempt-details">
              <summary>
                Attempt details <CaretDownIcon size={12} aria-hidden="true" />
              </summary>
              <dl>
                <div>
                  <dt>Attempt ID</dt>
                  <dd className="delivery-copy-value">
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
