"use client";

import { CaretRightIcon, CheckCircleIcon, LockSimpleIcon, QuestionIcon, SealCheckIcon, WarningIcon, XCircleIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/button";
import { CopyButton } from "@/components/copy-button";
import { Input, Textarea } from "@/components/input";
import { cn } from "@/lib/classes";
import { emptyInput, parseHeaderBlock, verify, type Adapter, type ComputedCheck, type ProviderId, type VerificationResult, type VerifierInput } from "./verifier/core";
import { adapters } from "./verifier/providers";

// Must match the max-[68.75rem] breakpoint below.
const stackedLayout = "(max-width: 68.75rem)";

const fieldStyles = "w-full min-w-0 min-h-10.5 rounded-md text-foreground text-[13px] py-2.25 px-3 placeholder:text-muted font-mono max-[37.5rem]:text-[16px]";
const labelStyles = "grid gap-1.5 min-w-0 [&_>_span]:text-[13px] [&_>_span]:font-medium";
const card = "rounded-[14px] border border-solid border-border bg-surface p-5 max-[37.5rem]:p-4";
const disclosure = "group rounded-md border border-solid border-border";
const disclosureSummary = "flex min-h-10.5 cursor-pointer list-none items-center gap-2 px-3 text-[13px] font-medium [&::-webkit-details-marker]:hidden";

const plainTextProps = {
  spellCheck: false,
  autoCapitalize: "off",
  autoCorrect: "off",
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-lpignore": "true",
} as const;

function formatDuration(totalSeconds: number) {
  const seconds = Math.abs(totalSeconds);
  const units: [number, string][] = [[86400, "day"], [3600, "hour"], [60, "minute"], [1, "second"]];
  const [size, unit] = units.find(([unitSize]) => seconds >= unitSize) ?? [1, "second"];
  const count = Math.floor(seconds / size);
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

export function SignatureVerifier({ provider }: { provider: ProviderId }) {
  const adapter = adapters[provider];
  const id = useId();
  const [input, setInput] = useState(emptyInput);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteStatus, setPasteStatus] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);
  // Discards results from checks superseded by newer input.
  const run = useRef(0);

  useEffect(() => {
    if (!result || !window.matchMedia(stackedLayout).matches) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [result]);

  function reset(next: VerifierInput) {
    run.current += 1;
    setInput(next);
    setResult(null);
    setChecking(false);
  }

  function update(name: keyof VerifierInput, value: string) {
    reset({ ...input, [name]: value });
  }

  async function check(next: VerifierInput) {
    const current = ++run.current;
    setChecking(true);
    try {
      const outcome = await verify(adapter, next);
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
    const sample = await adapter.sample();
    if (current !== run.current) return;
    setInput(sample);
    setPasteStatus("");
    await check(sample);
  }

  function clear() {
    reset(emptyInput);
    setPasted("");
    setPasteStatus("");
  }

  function fillFromHeaders() {
    const headers = parseHeaderBlock(pasted);
    const next = { ...input };
    const filled: string[] = [];
    const missing: string[] = [];
    for (const field of adapter.fields) {
      if (field.headers.length === 0) continue;
      const name = field.headers.find((header) => headers.has(header));
      if (name) {
        next[field.name] = headers.get(name)!;
        filled.push(field.label);
      } else missing.push(field.label);
    }
    if (filled.length > 0) reset(next);
    setPasteStatus(filled.length > 0
      ? `Filled ${filled.join(", ")}.${missing.length > 0 ? ` Not found: ${missing.join(", ")}.` : ""}`
      : `None of the ${adapter.name} headers were found. Paste lines like "${adapter.fields.find((field) => field.headers.length > 0)?.label}: …".`);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start gap-5 max-[68.75rem]:grid-cols-1">
      <form onSubmit={submit} autoComplete="off" className={cn(card, "grid gap-4")}>
        <details className={disclosure}>
          <summary className={disclosureSummary}>
            <CaretRightIcon size={13} aria-hidden="true" className="shrink-0 text-muted motion-safe:transition-transform group-open:rotate-90" />
            Paste request headers
          </summary>
          <div className="grid gap-2.5 px-3 pb-3">
            <p className="text-muted text-[12px] leading-[1.6]">Paste the headers from a log, a request inspector, or curl -v, as Name: value lines or JSON. The matching fields below are filled in.</p>
            <Textarea
              aria-label="Request headers"
              className={cn(fieldStyles, "min-h-24 resize-y leading-[1.65]")}
              value={pasted}
              placeholder={adapter.fields.filter((field) => field.headers.length > 0).map((field) => `${field.label}: …`).join("\n")}
              {...plainTextProps}
              onChange={(event) => {
                setPasted(event.target.value);
                setPasteStatus("");
              }}
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Button type="button" variant="secondary" size="small" disabled={!pasted.trim()} onClick={fillFromHeaders}>Fill fields</Button>
              <p role="status" className="text-muted text-[12px] leading-[1.6]">{pasteStatus}</p>
            </div>
          </div>
        </details>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 max-[37.5rem]:grid-cols-1">
          {adapter.fields.map((field) => (
            <label key={field.name} className={cn(labelStyles, field.wide && "col-span-2 max-[37.5rem]:col-span-1")} htmlFor={`${id}-${field.name}`}>
              <span>{field.label}</span>
              <Input
                id={`${id}-${field.name}`}
                className={fieldStyles}
                value={input[field.name]}
                placeholder={field.placeholder}
                {...plainTextProps}
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
              placeholder={adapter.bodyPlaceholder}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(event) => update("body", event.target.value)}
            />
          </label>
        </div>
        {adapter.codeMistakes && (
          <details className={disclosure}>
            <summary className={disclosureSummary}>
              <CaretRightIcon size={13} aria-hidden="true" className="shrink-0 text-muted motion-safe:transition-transform group-open:rotate-90" />
              Signature your code computed <span className="font-normal text-muted">(optional)</span>
            </summary>
            <div className="grid gap-2 px-3 pb-3">
              <p className="text-muted text-[12px] leading-[1.6]">If your code rejects a request that verifies here, print the signature it computes for this request and paste it. The tool finds which mistake produces that value.</p>
              <Input
                aria-label="Signature your code computed"
                className={fieldStyles}
                value={input.computed}
                placeholder={adapter.encoding === "hex" ? "64 hex characters" : "44 Base64 characters"}
                {...plainTextProps}
                onChange={(event) => update("computed", event.target.value)}
              />
            </div>
          </details>
        )}
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
        {result ? <ResultPanel result={result} /> : <EmptyResult adapter={adapter} />}
      </div>
    </div>
  );
}

function EmptyResult({ adapter }: { adapter: Adapter }) {
  return (
    <div className={cn(card, "border-dashed bg-transparent")}>
      <span className="flex size-10 items-center justify-center rounded-[10px] bg-accent-subtle text-accent">
        <SealCheckIcon size={22} aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-[16px] font-medium leading-[1.4]">The result shows up here</h2>
      <p className="mt-1.5 text-muted text-[14px] leading-[1.7]">
        {adapter.emptyState} To see how it works first, use <strong className="font-medium text-foreground">Try an example</strong>.
      </p>
      <p className="mt-4 text-[12px] font-medium text-muted">What gets signed</p>
      <code className="mt-1.5 block overflow-x-auto rounded-md bg-surface-hover px-3 py-2.5 font-mono text-[12px] leading-[1.7] whitespace-pre">
        {adapter.formula}
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
              <p className="mt-1.5 text-[14px] leading-[1.7]">None of the {result.signatureCount === 1 ? "signature" : `${result.signatureCount} signatures`} in the header were made with this secret over this exact message. The usual causes:</p>
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

const tones = {
  success: "border-success bg-success-subtle [&_>_svg]:text-success",
  danger: "border-danger bg-danger-subtle [&_>_svg]:text-danger",
  warning: "border-warning bg-warning-subtle [&_>_svg]:text-warning",
};

function Panel({ tone, icon, title, children }: { tone: keyof typeof tones; icon: ReactNode; title: string; children: ReactNode }) {
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
