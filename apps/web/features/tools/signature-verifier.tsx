"use client";

import { CheckCircleIcon, LockSimpleIcon, SealCheckIcon, WarningIcon, XCircleIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/button";
import { CopyButton } from "@/components/copy-button";
import { Input, Textarea } from "@/components/input";
import { cn } from "@/lib/classes";
import {
  sampleInput,
  timestampToleranceSeconds,
  verifySignature,
  type VerificationInput,
  type VerificationResult,
} from "./webhook-signature";

const emptyInput: VerificationInput = { secret: "", id: "", timestamp: "", signature: "", body: "" };

// The two short header values share a row; the long ones get the full width.
const fields = [
  { name: "secret", label: "Signing secret", placeholder: "whsec_…", wide: true },
  { name: "id", label: "Webhook-Id", placeholder: "0196f2c4-8a1e-7c3b-9d2f-…", wide: false },
  { name: "timestamp", label: "Webhook-Timestamp", placeholder: "1767225600", wide: false },
  { name: "signature", label: "Webhook-Signature", placeholder: "v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=", wide: true },
] as const;

// Matches the breakpoint where the result column drops below the form.
const stackedLayout = "(max-width: 68.75rem)";

const fieldStyles = "w-full min-w-0 min-h-10.5 rounded-md text-foreground text-[13px] py-2.25 px-3 placeholder:text-muted font-mono max-[37.5rem]:text-[16px]";
const labelStyles = "grid gap-1.5 min-w-0 [&_>_span]:text-[13px] [&_>_span]:font-medium";
const card = "rounded-[14px] border border-solid border-border bg-surface p-5 max-[37.5rem]:p-4";

function formatDuration(totalSeconds: number) {
  const seconds = Math.abs(totalSeconds);
  const units: [number, string][] = [[86400, "day"], [3600, "hour"], [60, "minute"], [1, "second"]];
  const [size, unit] = units.find(([unitSize]) => seconds >= unitSize) ?? [1, "second"];
  const count = Math.floor(seconds / size);
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

export function SignatureVerifier() {
  const id = useId();
  const [input, setInput] = useState(emptyInput);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [checking, setChecking] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  // Ignores a slow check that finishes after the inputs have changed again.
  const run = useRef(0);

  // Side by side the result is already in view; stacked, it lands below the
  // form, so bring it up rather than leave the visitor wondering what happened.
  useEffect(() => {
    if (!result || !window.matchMedia(stackedLayout).matches) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [result]);

  function update(name: keyof VerificationInput, value: string) {
    run.current += 1;
    setInput((current) => ({ ...current, [name]: value }));
    setResult(null);
    setChecking(false);
  }

  async function check(next: VerificationInput) {
    const current = ++run.current;
    setChecking(true);
    try {
      const outcome = await verifySignature(next);
      if (current === run.current) setResult(outcome);
    } finally {
      if (current === run.current) setChecking(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void check(input);
  }

  async function loadSample() {
    const current = ++run.current;
    const sample = await sampleInput();
    if (current !== run.current) return;
    setInput(sample);
    await check(sample);
  }

  function clear() {
    run.current += 1;
    setInput(emptyInput);
    setResult(null);
    setChecking(false);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start gap-5 max-[68.75rem]:grid-cols-1">
      <form onSubmit={submit} autoComplete="off" className={cn(card, "grid gap-4")}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 max-[37.5rem]:grid-cols-1">
          {fields.map((field) => (
            <label key={field.name} className={cn(labelStyles, field.wide && "col-span-2 max-[37.5rem]:col-span-1")} htmlFor={`${id}-${field.name}`}>
              <span>{field.label}</span>
              <Input
                id={`${id}-${field.name}`}
                className={fieldStyles}
                value={input[field.name]}
                placeholder={field.placeholder}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                onChange={(event) => update(field.name, event.target.value)}
              />
            </label>
          ))}
          <label className={cn(labelStyles, "col-span-2 max-[37.5rem]:col-span-1")} htmlFor={`${id}-body`}>
            <span>Raw request body</span>
            <Textarea
              id={`${id}-body`}
              className={cn(fieldStyles, "min-h-32 resize-y leading-[1.65] tab-2")}
              value={input.body}
              placeholder='{"type":"invoice.paid","data":{…}}'
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(event) => update("body", event.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={checking}>{checking ? "Checking…" : "Verify signature"}</Button>
          <Button type="button" variant="secondary" disabled={checking} onClick={() => void loadSample()}>Try an example</Button>
          <Button type="button" variant="quiet" onClick={clear}>Clear</Button>
        </div>
        <p className="flex items-start gap-2 text-muted text-[12px] leading-[1.6]">
          <LockSimpleIcon size={14} aria-hidden="true" className="shrink-0 mt-0.5" />
          Runs entirely in your browser with Web Crypto. Nothing you paste is sent anywhere or saved.
        </p>
      </form>
      <div ref={resultRef} aria-live="polite" className="sticky top-6 scroll-mt-6 max-[68.75rem]:static">
        {result ? <ResultPanel result={result} /> : <EmptyResult />}
      </div>
    </div>
  );
}

function EmptyResult() {
  return (
    <div className={cn(card, "border-dashed bg-transparent")}>
      <span className="flex size-10 items-center justify-center rounded-[10px] bg-accent-subtle text-accent">
        <SealCheckIcon size={22} aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-[16px] font-medium leading-[1.4]">The result shows up here</h2>
      <p className="mt-1.5 text-muted text-[14px] leading-[1.7]">
        Paste the secret, the three headers, and the raw body from a request, then verify. To see how it works first, use <strong className="font-medium text-foreground">Try an example</strong>.
      </p>
      <p className="mt-4 text-[12px] font-medium text-muted">What gets signed</p>
      <code className="mt-1.5 block overflow-x-auto rounded-md bg-surface-hover px-3 py-2.5 font-mono text-[12px] leading-[1.7] whitespace-pre">
        {"HMAC-SHA256(key, id + \".\" + timestamp + \".\" + body)"}
      </code>
    </div>
  );
}

function ResultPanel({ result }: { result: VerificationResult }) {
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
  if (timestamp.looksLikeMilliseconds) timestampNotes.push("Webhook-Timestamp looks like milliseconds. It should be whole seconds since the Unix epoch.");
  else if (!timestamp.withinTolerance) {
    const when = timestamp.ageSeconds > 0 ? `${formatDuration(timestamp.ageSeconds)} old` : `${formatDuration(timestamp.ageSeconds)} in the future`;
    timestampNotes.push(`The timestamp is ${when}. Receivers with the usual ${timestampToleranceSeconds / 60}-minute tolerance reject it to block replays. That's expected for a request captured earlier, since every delivery attempt is signed with a fresh timestamp.`);
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
              <p className="mt-1.5 text-[14px] leading-[1.7]">None of the {result.signatureCount === 1 ? "signature" : `${result.signatureCount} signatures`} in the header were made with this secret over this exact message. The usual causes:</p>
              <ul className="mt-2 pl-5 [list-style:disc] text-[14px] leading-[1.7]">
                <li>The secret belongs to a different endpoint, or it was rotated and you have the old one.</li>
                <li>The body isn&apos;t the exact raw bytes that were sent. Copy it from the raw request, not a parsed or pretty-printed view.</li>
                <li>The Webhook-Id or Webhook-Timestamp came from a different delivery attempt than the signature.</li>
              </ul>
            </>
          )}
        </Panel>
      )}
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
            <p className="mt-1.5 text-muted text-[12px]">HMAC-SHA256 over these bytes, keyed with the Base64-decoded secret (without whsec_).</p>
          </dd>
        </div>
        <div>
          <dt>Expected Webhook-Signature</dt>
          <dd className="flex items-center gap-2">
            <code className="block flex-1 min-w-0 overflow-x-auto rounded-md bg-surface-hover px-3 py-2.5 font-mono text-[12px] leading-[1.7] whitespace-pre">{result.expectedHeader}</code>
            <CopyButton value={result.expectedHeader} iconOnly label="Copy expected signature" />
          </dd>
        </div>
      </dl>
    </div>
  );
}

const tones = {
  success: "border-success bg-success-subtle [&_>_svg]:text-success",
  danger: "border-danger bg-danger-subtle [&_>_svg]:text-danger",
  warning: "border-warning bg-warning-subtle [&_>_svg]:text-warning",
};

function Panel({ tone, icon, title, children }: { tone: keyof typeof tones; icon: React.ReactNode; title: string; children: React.ReactNode }) {
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
