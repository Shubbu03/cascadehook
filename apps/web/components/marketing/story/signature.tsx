"use client";

import { ArrowUpRightIcon, CheckIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useState } from "react";
import { DocsLink } from "@/components/docs-link";
import { storyDelivery, storyEndpoints, storyEvent } from "@/features/marketing/story";
import { storyCard } from "./fan-out";

type Part = "id" | "timestamp" | "body" | "all" | null;

const host = storyEndpoints[0].url.split("/")[0];
const original = storyEvent.body;
const tamperedFrom = original.indexOf("inv_1024") + "inv_102".length;
const tampered = original.slice(0, tamperedFrom) + "5" + original.slice(tamperedFrom + 1);

const verify = [
  "const key = decodeSecret(signingSecret);",
  "const id = verifyWebhook(rawBody, req.headers, key);",
  "// Verify before parsing the request body.",
].join("\n");

const cardHeader = "flex items-center justify-between gap-3 border-b border-solid border-border px-5 py-3.5 text-muted text-[12px] max-[37.5rem]:px-4";
const codeBlock = "m-0 overflow-x-auto px-5 py-5 text-[11px] leading-[1.95] max-[37.5rem]:px-4";
const textLink = "inline-flex min-h-11 items-center gap-1.75 text-accent text-[12px] hover:underline hover:underline-offset-4";
const lit = "bg-accent-subtle text-foreground";

function Body({ tamper }: { tamper: boolean }) {
  if (!tamper) return <>{original}</>;
  return (
    <>
      {tampered.slice(0, tamperedFrom)}
      <mark className="rounded-[3px] bg-danger-subtle px-0.5 text-danger motion-safe:animate-status-pop">5</mark>
      {tampered.slice(tamperedFrom + 1)}
    </>
  );
}

export function Signature() {
  const [part, setPart] = useState<Part>(null);
  const [tamper, setTamper] = useState(false);
  const hover = (next: Part) => ({ onMouseEnter: () => setPart(next), onMouseLeave: () => setPart(null) });
  const covers = (target: Exclude<Part, null | "all">) => part === target || part === "all";

  const headers: { name: string; value: string; part: Part }[] = [
    { name: "Webhook-Id", value: storyDelivery.id, part: "id" },
    { name: "Webhook-Timestamp", value: String(storyDelivery.timestamp), part: "timestamp" },
    { name: "Webhook-Signature", value: storyDelivery.signature, part: "all" },
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-4 max-[68.75rem]:grid-cols-[minmax(0,1fr)]" data-motion="reveal">
      <figure className={storyCard}>
        <figcaption className={cardHeader}>
          <span>What your billing service receives</span>
          <span className="hidden font-mono text-[11px] min-[37.5rem]:inline">hover a header</span>
        </figcaption>
        <pre className={codeBlock}><code>
          <span className="block text-muted">POST {storyDelivery.path} HTTP/1.1</span>
          <span className="block text-muted">Host: {host}</span>
          <span className="block text-muted">Content-Type: application/json</span>
          <span className="block text-muted">User-Agent: Cascadehook/1</span>
          <span className="-mx-2 block overflow-hidden rounded-[5px] bg-accent-subtle">
            {headers.map((header) => (
              <span key={header.name} {...hover(header.part)}
                className={`block cursor-default px-2 transition-colors duration-150 ${part === header.part ? "bg-accent text-accent-foreground" : "text-foreground"}`}>
                {header.name}: {header.value}
              </span>
            ))}
          </span>
          <span className="block"> </span>
          <span {...hover("body")} className={`block -mx-2 cursor-default rounded-[5px] px-2 transition-colors duration-150 ${part === "body" ? lit : "text-muted"}`}>
            <Body tamper={tamper} />
          </span>
        </code></pre>
        <div className="border-t border-dashed border-border px-5 py-4 max-[37.5rem]:px-4">
          <p className="text-muted text-[11px]">Signed content</p>
          <code className="mt-1.5 block break-all text-[11px] leading-[1.8]">
            <span className={`rounded-[3px] transition-colors duration-150 ${covers("id") ? lit : "text-muted"}`}>{storyDelivery.id}</span>
            <span className="text-muted">.</span>
            <span className={`rounded-[3px] transition-colors duration-150 ${covers("timestamp") ? lit : "text-muted"}`}>{storyDelivery.timestamp}</span>
            <span className="text-muted">.</span>
            <span className={`rounded-[3px] transition-colors duration-150 ${covers("body") ? lit : "text-muted"}`}><Body tamper={tamper} /></span>
          </code>
        </div>
      </figure>
      <figure className={`flex flex-col ${storyCard}`}>
        <figcaption className={cardHeader}>
          <span>How it checks the request</span>
          <span className="font-mono text-[11px]">HMAC-SHA256</span>
        </figcaption>
        <pre className={codeBlock}><code>{verify}</code></pre>
        <div aria-live="polite" key={String(tamper)}
          className={`mx-5 flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-[12px] motion-safe:animate-row-in max-[37.5rem]:mx-4 ${tamper ? "bg-danger-subtle text-danger" : "bg-success-subtle text-success"}`}>
          {tamper ? <XIcon size={14} weight="bold" aria-hidden="true" /> : <CheckIcon size={14} weight="bold" aria-hidden="true" />}
          {tamper ? "Signature doesn't match. Reject the request." : "Signature matches. Safe to process."}
        </div>
        <button type="button" role="switch" aria-checked={tamper} onClick={() => setTamper((value) => !value)}
          className="mx-5 mt-3 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-solid border-border px-3.5 text-left text-[12px] transition-colors hover:bg-surface-hover max-[37.5rem]:mx-4">
          <span>Tamper with the body in transit</span>
          <span aria-hidden="true" className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${tamper ? "bg-danger" : "bg-border"}`}>
            <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-background transition-transform duration-200 motion-reduce:transition-none ${tamper ? "translate-x-4" : ""}`} />
          </span>
        </button>
        <ul className="mt-4 grid list-none gap-2 px-5 m-0 text-muted text-[12px] leading-[1.7] max-[37.5rem]:px-4">
          <li>Any Standard Webhooks library can verify it.</li>
          <li>When you rotate a secret, the old one keeps signing for 5 minutes.</li>
        </ul>
        <div className="mt-auto flex flex-wrap gap-x-5 px-5 pt-2 pb-2 max-[37.5rem]:px-4">
          <Link href="/tools/webhook-signature-verifier" className={textLink}>Try the signature verifier <ArrowUpRightIcon size={13} aria-hidden="true" /></Link>
          <DocsLink path="/docs/security/signatures" className={textLink}>Receiver guide <ArrowUpRightIcon size={13} aria-hidden="true" /></DocsLink>
        </div>
      </figure>
    </div>
  );
}
