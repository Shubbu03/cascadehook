"use client";

import { ArrowClockwiseIcon, CheckCircleIcon, TrashIcon, TrayArrowDownIcon, WarningIcon, XCircleIcon } from "@phosphor-icons/react";
import type { CapturedRequest, ServerMessage } from "inbox/protocol";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/button";
import { CopyButton } from "@/components/copy-button";
import { Input } from "@/components/input";
import { cn } from "@/lib/classes";
import { ReferenceTabs } from "../reference-tabs";
import { fieldStyles, plainTextProps } from "../signature-verifier";
import { card, Panel, ResultPanel } from "../verification-result";
import { verify, type ProviderId, type VerificationResult } from "../verifier/core";
import { adapters } from "../verifier/providers";
import { decodeBase64, exactText, formatBytes, hexDump, prettyJson } from "./body";
import { buildInput, detectedHeaders, detectProvider, headerMap } from "./detect";
import { connectInbox, createInbox, deleteInbox, inboxBaseURL, InboxError, loadStoredInbox, saveStoredInbox, type ConnectionStatus, type StoredInbox } from "./inbox-client";

const maxShown = 50;

type Info = {
  headers: Map<string, string>;
  provider: ProviderId | null;
  bytes: Uint8Array;
  text: string | null;
  pretty: string | null;
};

const infoCache = new WeakMap<CapturedRequest, Info>();

function describe(request: CapturedRequest): Info {
  const cached = infoCache.get(request);
  if (cached) return cached;
  const headers = headerMap(request.headers);
  const bytes = decodeBase64(request.bodyBase64);
  const text = exactText(bytes);
  const info = { headers, provider: detectProvider(headers), bytes, text, pretty: text === null ? null : prettyJson(text) };
  infoCache.set(request, info);
  return info;
}

type Check =
  | { secret: string; status: "checked"; result: VerificationResult }
  | { secret: string; status: "unverifiable"; reason: "truncated" | "binary" };

async function checkRequest(request: CapturedRequest, secret: string): Promise<Check | null> {
  const info = describe(request);
  if (!info.provider) return null;
  if (request.truncated) return { secret, status: "unverifiable", reason: "truncated" };
  if (info.text === null) return { secret, status: "unverifiable", reason: "binary" };
  const adapter = adapters[info.provider];
  return { secret, status: "checked", result: await verify(adapter, buildInput(adapter, info.headers, info.text, secret)) };
}

// A coarse clock for relative times; it only ticks twice a minute.
const clockPeriod = 30_000;
function subscribeClock(onChange: () => void) {
  const timer = window.setInterval(onChange, clockPeriod);
  return () => window.clearInterval(timer);
}
const clockSnapshot = () => Math.floor(Date.now() / clockPeriod) * clockPeriod;
const serverClock = () => 0;

function ago(time: number, now: number) {
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.floor(seconds / 3600)} h ago`;
}

function expiresIn(expiresAt: number, now: number) {
  const minutes = Math.max(0, Math.round((expiresAt - now) / 60_000));
  return minutes >= 60 ? `Expires in ${Math.round(minutes / 60)} h` : `Expires in ${minutes} min`;
}

function fullURL(inbox: StoredInbox, request: CapturedRequest) {
  return inbox.url + request.path + (request.query ? "?" + request.query : "");
}

const createErrors: Record<string, string> = {
  rate_limited: "Too many new URLs from your network. Wait a minute, then try again.",
  network: "Couldn't reach in.cascadehook.com. Check your connection, then try again.",
  create_failed: "Couldn't create a webhook URL. Try again in a moment.",
};

type Phase = { name: "loading" } | { name: "ready"; inbox: StoredInbox } | { name: "gone" } | { name: "error"; code: string };

export function WebhookTester() {
  if (!inboxBaseURL) {
    return (
      <div className={cn(card, "border-dashed bg-transparent")}>
        <h2 className="text-[16px] font-medium leading-[1.4]">The webhook tester isn&apos;t configured</h2>
        <p className="mt-1.5 text-muted text-[14px] leading-[1.7]">Set NEXT_PUBLIC_INBOX_BASE_URL to the inbox Worker&apos;s origin, such as http://localhost:8787, and rebuild.</p>
      </div>
    );
  }
  return <Tester base={inboxBaseURL} />;
}

function Tester({ base }: { base: string }) {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [selected, setSelected] = useState<{ seq: number; pinned: boolean } | null>(null);
  const [secrets, setSecrets] = useState<Partial<Record<ProviderId, string>>>({});
  const [checks, setChecks] = useState<Record<number, Check>>({});
  const [announcement, setAnnouncement] = useState("");
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, serverClock);

  const pending = useRef<Promise<StoredInbox> | null>(null);
  const requestsRef = useRef<CapturedRequest[]>([]);
  const secretsRef = useRef(secrets);
  const recheckTimer = useRef<number | undefined>(undefined);

  const runChecks = useCallback(async (list: CapturedRequest[], current: Partial<Record<ProviderId, string>>) => {
    const updates: Record<number, Check> = {};
    for (const request of list) {
      const provider = describe(request).provider;
      const secret = provider ? current[provider]?.trim() : undefined;
      if (!secret) continue;
      const check = await checkRequest(request, secret);
      if (check) updates[request.seq] = check;
    }
    if (Object.keys(updates).length > 0) setChecks((previous) => ({ ...previous, ...updates }));
  }, []);

  const start = useCallback((fresh: boolean) => {
    // Reuses one in-flight load, so effects that re-run (Strict Mode, Activity) never mint a second inbox.
    if (!pending.current) {
      const stored = fresh ? null : loadStoredInbox();
      pending.current = stored ? Promise.resolve(stored) : createInbox(base).then((inbox) => {
        saveStoredInbox(inbox);
        return inbox;
      });
    }
    const load = pending.current;
    load.then(
      (inbox) => {
        if (pending.current === load) setPhase({ name: "ready", inbox });
      },
      (error: unknown) => {
        if (pending.current !== load) return;
        pending.current = null;
        setPhase({ name: "error", code: error instanceof InboxError ? error.code : "create_failed" });
      },
    );
  }, [base]);

  useEffect(() => {
    start(false);
  }, [start]);

  const inbox = phase.name === "ready" ? phase.inbox : null;

  useEffect(() => {
    if (!inbox) return;
    const latestSeq = () => requestsRef.current[0]?.seq ?? 0;
    function onMessage(message: ServerMessage) {
      if (message.type === "request") {
        const request = message.request;
        if (requestsRef.current.some((existing) => existing.seq === request.seq)) return;
        requestsRef.current = [request, ...requestsRef.current].sort((a, b) => b.seq - a.seq).slice(0, maxShown);
        setRequests(requestsRef.current);
        setSelected((current) => (current?.pinned ? current : { seq: requestsRef.current[0]!.seq, pinned: false }));
        setAnnouncement(`New ${request.method} request received.`);
        void runChecks([request], secretsRef.current);
        return;
      }
      if (message.type === "ready") return;
      if (loadStoredInbox()?.inboxId === inbox!.inboxId) saveStoredInbox(null);
      pending.current = null;
      setPhase({ name: "gone" });
    }
    return connectInbox(base, inbox, latestSeq, onMessage, setStatus);
  }, [base, inbox, runChecks]);

  function reset() {
    requestsRef.current = [];
    setRequests([]);
    setSelected(null);
    setChecks({});
    setStatus("connecting");
  }

  function newURL() {
    if (inbox) void deleteInbox(base, inbox);
    saveStoredInbox(null);
    pending.current = null;
    reset();
    setPhase({ name: "loading" });
    start(true);
  }

  function remove() {
    if (!inbox) return;
    void deleteInbox(base, inbox);
    saveStoredInbox(null);
    pending.current = null;
    reset();
    setPhase({ name: "gone" });
  }

  function updateSecret(provider: ProviderId, value: string) {
    const next = { ...secretsRef.current, [provider]: value };
    secretsRef.current = next;
    setSecrets(next);
    window.clearTimeout(recheckTimer.current);
    recheckTimer.current = window.setTimeout(() => void runChecks(requestsRef.current, next), 250);
  }

  const current = requests.find((request) => request.seq === selected?.seq) ?? requests[0];

  return (
    <div className="grid gap-5">
      <p role="status" className="sr-only">{announcement}</p>
      {phase.name === "loading" && <Notice title="Creating your webhook URL…" />}
      {phase.name === "error" && (
        <Notice title="No webhook URL yet" tone="warning">
          <p className="mt-1.5 text-muted text-[14px] leading-[1.7]">{createErrors[phase.code] ?? createErrors.create_failed}</p>
          <Button type="button" variant="secondary" size="small" className="mt-3" onClick={newURL}>Try again</Button>
        </Notice>
      )}
      {phase.name === "gone" && (
        <Notice title="This webhook URL is gone">
          <p className="mt-1.5 text-muted text-[14px] leading-[1.7]">It was deleted or reached its 24-hour limit, and its requests were erased. Anything still sending to it gets a 404.</p>
          <Button type="button" size="small" className="mt-3" onClick={newURL}>Create a new URL</Button>
        </Notice>
      )}
      {inbox && (
        <>
          <InboxBar inbox={inbox} status={status} now={now} onNew={newURL} onDelete={remove} />
          {current ? (
            <div className="grid grid-cols-[minmax(0,22rem)_minmax(0,1fr)] items-start gap-5 max-[68.75rem]:grid-cols-1">
              <RequestList
                requests={requests}
                selectedSeq={current.seq}
                checks={checks}
                secrets={secrets}
                now={now}
                onSelect={(seq) => setSelected({ seq, pinned: seq !== requests[0]?.seq })}
              />
              <RequestDetail
                key={current.seq}
                inbox={inbox}
                request={current}
                check={checks[current.seq]}
                secrets={secrets}
                onSecret={updateSecret}
              />
            </div>
          ) : (
            <EmptyState inbox={inbox} />
          )}
        </>
      )}
    </div>
  );
}

function Notice({ title, tone, children }: { title: string; tone?: "warning"; children?: ReactNode }) {
  return (
    <div className={cn(card, "border-dashed bg-transparent", tone === "warning" && "border-warning")}>
      <h2 className="text-[16px] font-medium leading-[1.4]">{title}</h2>
      {children}
    </div>
  );
}

const statusLabels: Record<ConnectionStatus, string> = { connecting: "Connecting", live: "Live", reconnecting: "Reconnecting", gone: "Closed" };
const statusDots: Record<ConnectionStatus, string> = { connecting: "bg-warning", live: "bg-success", reconnecting: "bg-warning", gone: "bg-danger" };

function InboxBar({ inbox, status, now, onNew, onDelete }: { inbox: StoredInbox; status: ConnectionStatus; now: number; onNew: () => void; onDelete: () => void }) {
  return (
    <section aria-label="Your webhook URL" className={cn(card, "grid gap-3")}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-[13px] font-medium">Your webhook URL</h2>
        <p className="flex items-center gap-3 text-muted text-[12px] leading-[1.6]">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("size-2 rounded-full", statusDots[status])} />
            {statusLabels[status]}
          </span>
          {now > 0 && <span>{expiresIn(inbox.expiresAt, now)}</span>}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <code className="block min-w-0 flex-1 overflow-x-auto rounded-md bg-surface-hover px-3 py-2.5 font-mono text-[13px] leading-[1.7] whitespace-nowrap">{inbox.url}</code>
        <CopyButton value={inbox.url} label="Copy URL" successMessage="Webhook URL copied." />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex items-start gap-2 text-muted text-[12px] leading-[1.6]">
          <WarningIcon size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
          Test data only. Anyone with this URL can send to it, and requests are deleted after 24 hours. Don&apos;t send production or customer data.
        </p>
        <div className="flex gap-1.5">
          <Button type="button" variant="quiet" size="small" onClick={onNew}>
            <ArrowClockwiseIcon size={15} aria-hidden="true" />
            New URL
          </Button>
          <Button type="button" variant="quiet" size="small" onClick={onDelete}>
            <TrashIcon size={15} aria-hidden="true" />
            Delete
          </Button>
        </div>
      </div>
    </section>
  );
}

function EmptyState({ inbox }: { inbox: StoredInbox }) {
  const curl = `curl -X POST '${inbox.url}' -H 'Content-Type: application/json' -d '{"hello":"world"}'`;
  return (
    <section aria-label="Waiting for requests" className={cn(card, "border-dashed bg-transparent")}>
      <span className="flex size-10 items-center justify-center rounded-[10px] bg-accent-subtle text-accent">
        <TrayArrowDownIcon size={22} aria-hidden="true" />
      </span>
      <h2 className="mt-4 flex items-center gap-2 text-[16px] font-medium leading-[1.4]">
        <span aria-hidden="true" className="size-2 rounded-full bg-accent motion-safe:animate-pulse" />
        Waiting for the first request…
      </h2>
      <p className="mt-1.5 max-w-150 text-muted text-[14px] leading-[1.7]">
        Paste the URL above into Stripe, GitHub, Shopify, Slack, or your own app as the webhook endpoint, or send a request from a terminal. It shows up here the moment it arrives, with any signature checked.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <code className="block min-w-0 flex-1 overflow-x-auto rounded-md bg-surface-hover px-3 py-2.5 font-mono text-[12px] leading-[1.7] whitespace-pre">{curl}</code>
        <CopyButton value={curl} iconOnly label="Copy curl command" />
      </div>
    </section>
  );
}

function SignatureBadge({ check, secret }: { check: Check | undefined; secret: string | undefined }) {
  if (!check || !secret || check.secret !== secret.trim() || check.status !== "checked") return null;
  if (check.result.status === "valid") return <CheckCircleIcon size={16} weight="fill" className="text-success" aria-label="Signature valid" />;
  return <XCircleIcon size={16} weight="fill" className="text-danger" aria-label="Signature doesn't match" />;
}

function RequestList({ requests, selectedSeq, checks, secrets, now, onSelect }: {
  requests: CapturedRequest[];
  selectedSeq: number;
  checks: Record<number, Check>;
  secrets: Partial<Record<ProviderId, string>>;
  now: number;
  onSelect: (seq: number) => void;
}) {
  return (
    <section aria-label="Requests" className={cn(card, "p-2 max-[37.5rem]:p-2")}>
      <h2 className="px-2.5 pt-1.5 pb-2 text-[13px] font-medium">
        Requests <span className="font-normal text-muted">({requests.length}{requests.length >= maxShown ? ", newest kept" : ""})</span>
      </h2>
      <ul className="grid gap-0.5 max-h-[38rem] overflow-y-auto max-[68.75rem]:max-h-80">
        {requests.map((request) => {
          const provider = describe(request).provider;
          return (
            <li key={request.seq}>
              <button
                type="button"
                aria-current={request.seq === selectedSeq ? "true" : undefined}
                onClick={() => onSelect(request.seq)}
                className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-hover aria-[current]:bg-surface-hover"
              >
                <span className="font-mono text-[12px] font-medium">{request.method}</span>
                <span className="truncate font-mono text-[12px] text-muted">{request.path || "/"}{request.query ? "?" + request.query : ""}</span>
                <SignatureBadge check={checks[request.seq]} secret={provider ? secrets[provider] : undefined} />
                <span className="col-span-3 flex flex-wrap gap-x-2 text-muted text-[11px] leading-[1.6]">
                  <span>{ago(request.receivedAt, now || request.receivedAt)}</span>
                  <span>{formatBytes(request.bodySize)}</span>
                  {provider && <span className="text-foreground">{adapters[provider].name}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RequestDetail({ inbox, request, check, secrets, onSecret }: {
  inbox: StoredInbox;
  request: CapturedRequest;
  check: Check | undefined;
  secrets: Partial<Record<ProviderId, string>>;
  onSecret: (provider: ProviderId, value: string) => void;
}) {
  const info = describe(request);
  const contentType = info.headers.get("content-type");
  const received = new Date(request.receivedAt);
  const summary: [string, string][] = [
    ["URL", fullURL(inbox, request)],
    ["Received", received.toLocaleString()],
    ["Size", formatBytes(request.bodySize) + (request.truncated ? `, first ${formatBytes(info.bytes.length)} kept` : "")],
    ["From", [request.sourceIp, request.country].filter(Boolean).join(", ") || "Unknown"],
    ["Content-Type", contentType ?? "None"],
  ];
  return (
    <div className="grid gap-5 min-w-0">
      <section aria-label="Request summary" className={card}>
        <h2 className="text-[16px] font-medium leading-[1.4]">
          <span className="font-mono">{request.method}</span> <span className="font-mono text-muted break-all">{request.path || "/"}</span>
        </h2>
        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px] leading-[1.6] [&_dt]:text-muted [&_dd]:min-w-0 [&_dd]:break-all">
          {summary.map(([label, value]) => (
            <div key={label} className="contents">
              <dt>{label}</dt>
              <dd className={label === "URL" ? "font-mono text-[12px]" : undefined}>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <SignatureCard request={request} info={info} check={check} secrets={secrets} onSecret={onSecret} />
      <ReferenceTabs
        label="Request data"
        tabs={[
          { id: "body", label: "Body", content: <BodyView info={info} request={request} /> },
          { id: "headers", label: `Headers (${request.headers.length})`, content: <HeadersView request={request} /> },
          { id: "query", label: "Query", content: <QueryView request={request} /> },
        ]}
      />
    </div>
  );
}

function SignatureCard({ request, info, check, secrets, onSecret }: {
  request: CapturedRequest;
  info: Info;
  check: Check | undefined;
  secrets: Partial<Record<ProviderId, string>>;
  onSecret: (provider: ProviderId, value: string) => void;
}) {
  const id = useId();
  if (!info.provider) {
    return (
      <section aria-label="Signature" className={cn(card, "bg-transparent")}>
        <h2 className="text-[15px] font-medium leading-[1.4]">No signature header</h2>
        <p className="mt-1.5 text-muted text-[13px] leading-[1.7]">
          Signed requests are checked automatically. The tester looks for {detectedHeaders.map((name, index) => (
            <span key={name}>{index > 0 && (index === detectedHeaders.length - 1 ? ", or " : ", ")}<code className="font-mono text-[12px] text-foreground">{name}</code></span>
          ))}. To check a signature by hand, use one of the <Link href="/tools" className="text-foreground underline underline-offset-[3px]">signature verifiers</Link>.
        </p>
      </section>
    );
  }
  const adapter = adapters[info.provider];
  const secretField = adapter.fields.find((field) => field.name === "secret")!;
  const secret = secrets[info.provider] ?? "";
  const currentCheck = check && check.secret === secret.trim() ? check : undefined;
  return (
    <section aria-label="Signature" className="grid gap-3">
      <div className={cn(card, "grid gap-3")}>
        <h2 className="text-[15px] font-medium leading-[1.4]">{adapter.name} signature</h2>
        <label htmlFor={`${id}-secret`} className="grid gap-1.5 text-[13px] font-medium">
          {secretField.label}
          <Input
            id={`${id}-secret`}
            className={fieldStyles}
            value={secret}
            placeholder={secretField.placeholder}
            {...plainTextProps}
            onChange={(event) => onSecret(info.provider!, event.target.value)}
          />
        </label>
        <p className="text-muted text-[12px] leading-[1.6]">Checked in your browser with Web Crypto. The secret is never sent or saved, and it applies to every {adapter.name} request in this list.</p>
      </div>
      {currentCheck?.status === "unverifiable" && (
        <Panel tone="warning" icon={<WarningIcon size={22} aria-hidden="true" />} title="This signature can't be checked here">
          <p className="mt-1.5 text-[14px] leading-[1.7]">
            {currentCheck.reason === "truncated"
              ? `The body was larger than ${formatBytes(info.bytes.length)}, so only part of it was kept, and a signature covers every byte.`
              : "The body isn't valid UTF-8 text, so this page can't reproduce the exact bytes the sender signed."}
          </p>
        </Panel>
      )}
      {currentCheck?.status === "checked" && <ResultPanel result={currentCheck.result} exactBody />}
      {!secret.trim() && request.truncated && (
        <p className="text-muted text-[12px] leading-[1.6]">This body was cut off at {formatBytes(info.bytes.length)}, so its signature can&apos;t be checked.</p>
      )}
    </section>
  );
}

const pre = "block max-h-[32rem] overflow-auto rounded-md bg-surface-hover px-3 py-2.5 font-mono text-[12px] leading-[1.7] whitespace-pre tab-2";

function BodyView({ info, request }: { info: Info; request: CapturedRequest }) {
  const [raw, setRaw] = useState(false);
  if (info.bytes.length === 0) return <p className="text-muted text-[13px]">No body.</p>;
  const shown = info.text === null ? hexDump(info.bytes) : raw || info.pretty === null ? info.text : info.pretty;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted text-[12px] leading-[1.6]">
          {info.text === null ? "Binary body, shown as hex." : info.pretty === null ? "Raw body, exactly as received." : raw ? "Raw body, exactly as received." : "JSON, formatted for reading."}
          {request.truncated && " Cut off at the size limit."}
        </p>
        <div className="flex gap-1.5">
          {info.pretty !== null && (
            <Button type="button" variant="quiet" size="small" aria-pressed={raw} onClick={() => setRaw(!raw)}>{raw ? "Show formatted" : "Show raw"}</Button>
          )}
          <CopyButton value={info.text ?? shown} label={info.text === null ? "Copy hex" : "Copy raw body"} />
        </div>
      </div>
      <pre className={pre}>{shown}</pre>
    </div>
  );
}

function HeadersView({ request }: { request: CapturedRequest }) {
  if (request.headers.length === 0) return <p className="text-muted text-[13px]">No headers.</p>;
  const lines = request.headers.map(([name, value]) => `${name}: ${value}`).join("\n");
  return (
    <div className="grid gap-2">
      <div className="flex justify-end"><CopyButton value={lines} label="Copy headers" /></div>
      <KeyValueTable rows={request.headers} />
    </div>
  );
}

function QueryView({ request }: { request: CapturedRequest }) {
  if (!request.query) return <p className="text-muted text-[13px]">No query string.</p>;
  return <KeyValueTable rows={[...new URLSearchParams(request.query).entries()]} />;
}

function KeyValueTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-solid border-border">
      <table className="w-full border-collapse text-left font-mono text-[12px] leading-[1.6]">
        <tbody>
          {rows.map(([name, value], index) => (
            <tr key={`${name}-${index}`} className="border-t border-solid border-border first:border-t-0">
              <th scope="row" className="w-[34%] px-3 py-1.5 align-top font-medium break-all">{name}</th>
              <td className="px-3 py-1.5 text-muted break-all">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
