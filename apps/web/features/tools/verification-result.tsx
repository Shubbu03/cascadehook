import { CheckCircleIcon, QuestionIcon, WarningIcon, XCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/classes";
import type { ComputedCheck, VerificationResult } from "./verifier/core";

export const card = "rounded-[14px] border border-solid border-border bg-surface p-5 max-[37.5rem]:p-4";

function formatDuration(totalSeconds: number) {
  const seconds = Math.abs(totalSeconds);
  const units: [number, string][] = [[86400, "day"], [3600, "hour"], [60, "minute"], [1, "second"]];
  const [size, unit] = units.find(([unitSize]) => seconds >= unitSize) ?? [1, "second"];
  const count = Math.floor(seconds / size);
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

// exactBody: the body is known to be the received bytes, so body re-encoding is ruled out.
export function ResultPanel({ result, exactBody = false }: { result: VerificationResult; exactBody?: boolean }) {
  if (result.status === "invalid-input") {
    return (
      <Panel tone="warning" icon={<WarningIcon size={22} aria-hidden="true" />} title="Some fields need attention">
        <ul className="mt-2 pl-5 [list-style:disc] text-[14px] leading-[1.7]">
          {result.problems.map((problem) => <li key={problem}>{problem}</li>)}
        </ul>
      </Panel>
    );
  }

  const { timestamp } = result;
  const timestampNotes: string[] = [];
  if (timestamp?.looksLikeMilliseconds) timestampNotes.push(`${timestamp.label} looks like milliseconds. It should be whole seconds since the Unix epoch.`);
  else if (timestamp && !timestamp.withinTolerance) {
    const when = timestamp.ageSeconds > 0 ? `${formatDuration(timestamp.ageSeconds)} old` : `${formatDuration(timestamp.ageSeconds)} in the future`;
    timestampNotes.push(`The timestamp is ${when}. Receivers with the usual ${timestamp.toleranceSeconds / 60}-minute tolerance reject it to block replays. That's expected for a request captured earlier, since every delivery attempt is signed with a fresh timestamp.`);
  }

  return (
    <div className="grid gap-3">
      {result.status === "valid" ? (
        <Panel tone="success" icon={<CheckCircleIcon size={22} weight="fill" aria-hidden="true" />} title="Signature is valid">
          <p className="mt-1.5 text-[14px] leading-[1.7]">
            This request was signed with this secret, and the body is byte-for-byte what was signed.
            {result.signatureCount > 1 && ` It matched signature ${result.matchedIndex! + 1} of ${result.signatureCount}. Senders include more than one while rotating secrets.`}
            {" "}If your own check rejects it, compare your code&apos;s values with the ones below.
          </p>
        </Panel>
      ) : (
        <Panel tone="danger" icon={<XCircleIcon size={22} weight="fill" aria-hidden="true" />} title={result.diagnosis ? `Signature doesn't match: ${result.diagnosis.title.toLowerCase()}` : "Signature doesn't match"}>
          {result.diagnosis ? (
            <p className="mt-1.5 text-[14px] leading-[1.7]">{result.diagnosis.detail}</p>
          ) : (
            <>
              <p className="mt-1.5 text-[14px] leading-[1.7]">
                None of the {result.signatureCount === 1 ? "signature" : `${result.signatureCount} signatures`} in the header were made with this secret over this exact message.
                {exactBody ? " This body is byte-for-byte what arrived, so the secret is the most likely difference. Other causes:" : " The usual causes:"}
              </p>
              <ul className="mt-2 pl-5 [list-style:disc] text-[14px] leading-[1.7]">
                {result.hints.map((hint) => <li key={hint}>{hint}</li>)}
              </ul>
            </>
          )}
        </Panel>
      )}
      {result.computed && <ComputedPanel computed={result.computed} headerValid={result.status === "valid"} />}
      {result.notes.map((note) => (
        <Panel key={note.title} tone="warning" icon={<WarningIcon size={22} aria-hidden="true" />} title={note.title}>
          <p className="mt-1.5 text-[14px] leading-[1.7]">{note.detail}</p>
        </Panel>
      ))}
      {timestampNotes.map((note) => (
        <Panel key={note} tone="warning" icon={<WarningIcon size={22} aria-hidden="true" />} title="Check the timestamp">
          <p className="mt-1.5 text-[14px] leading-[1.7]">{note}</p>
        </Panel>
      ))}
      <dl className={cn(card, "grid gap-4 [&_dt]:text-[13px] [&_dt]:font-medium [&_dd]:mt-1.5 [&_dd]:min-w-0")}>
        <div>
          <dt>Signed message</dt>
          <dd>
            <code className="block overflow-x-auto rounded-md bg-surface-hover px-3 py-2.5 font-mono text-[12px] leading-[1.7] whitespace-pre">{result.signedPrefix}<span className="text-muted">{`<raw body, ${result.bodyBytes} bytes>`}</span></code>
            <p className="mt-1.5 text-muted text-[12px]">{result.keyNote}</p>
          </dd>
        </div>
        <div>
          <dt>{result.expectedLabel}</dt>
          <dd className="flex items-center gap-2">
            <code className="block flex-1 min-w-0 overflow-x-auto rounded-md bg-surface-hover px-3 py-2.5 font-mono text-[12px] leading-[1.7] whitespace-pre">{result.expectedHeader}</code>
            <CopyButton value={result.expectedHeader} iconOnly label="Copy expected signature" />
          </dd>
        </div>
      </dl>
    </div>
  );
}

function ComputedPanel({ computed, headerValid }: { computed: ComputedCheck; headerValid: boolean }) {
  if (computed.status === "correct") {
    return (
      <Panel tone="success" icon={<CheckCircleIcon size={22} weight="fill" aria-hidden="true" />} title="Your code computes the right value">
        <p className="mt-1.5 text-[14px] leading-[1.7]">
          {headerValid
            ? "Your signature matches for this request, so the bug is in what happens around it: comparing against the whole header instead of the signature inside it, reading a different header, or verifying a body at runtime that isn't the raw bytes pasted here."
            : "Your code agrees with this tool for the inputs pasted here. Since the header doesn't match, the inputs themselves differ from what was signed; see the result above."}
        </p>
      </Panel>
    );
  }
  if (computed.status === "mistake") {
    return (
      <Panel tone="danger" icon={<XCircleIcon size={22} weight="fill" aria-hidden="true" />} title={computed.mistake.title}>
        <p className="mt-1.5 text-[14px] leading-[1.7]">{computed.mistake.detail}</p>
      </Panel>
    );
  }
  return (
    <Panel tone="warning" icon={<QuestionIcon size={22} aria-hidden="true" />} title="Your code's value isn't a known mistake">
      <p className="mt-1.5 text-[14px] leading-[1.7]">It isn&apos;t the expected signature, and none of the usual mistakes reproduce it. Check that your code uses this same secret and hashes these exact body bytes.</p>
    </Panel>
  );
}

export const tones = {
  success: "border-success bg-success-subtle [&_>_svg]:text-success",
  danger: "border-danger bg-danger-subtle [&_>_svg]:text-danger",
  warning: "border-warning bg-warning-subtle [&_>_svg]:text-warning",
};

export function Panel({ tone, icon, title, children }: { tone: keyof typeof tones; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className={cn("flex items-start gap-3.5 [&_>_svg]:shrink-0 rounded-[14px] border border-solid p-5 max-[37.5rem]:p-4", tones[tone])}>
      {icon}
      <div className="min-w-0">
        <h2 className="text-[16px] font-medium leading-[1.4]">{title}</h2>
        {children}
      </div>
    </section>
  );
}
