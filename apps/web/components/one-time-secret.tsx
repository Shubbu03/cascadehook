"use client";

import { Input } from "@/components/input";

import { Button } from "@/components/button";

import { useEffect, useId, useRef, useState } from "react";
import { CopyButton } from "./copy-button";

type SecretValue = { value: string; label: string; note?: string; };
type SecretState =
  | { status: "idle"; }
  | { status: "pending"; }
  | { status: "revealed"; secret: SecretValue; }
  | { status: "error"; message: string; };

export function useOneTimeSecret() {
  const [state, setState] = useState<SecretState>({ status: "idle" });
  const active = useRef(false);
  const generation = useRef(0);
  const pending = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      generation.current += 1;
      pending.current = false;
      setState({ status: "idle" });
    };
  }, []);

  async function run(request: () => Promise<SecretValue>) {
    if (pending.current) return;
    pending.current = true;
    const current = ++generation.current;
    setState({ status: "pending" });
    try {
      const secret = await request();
      if (active.current && generation.current === current)
        setState({ status: "revealed", secret });
    } catch (error) {
      if (active.current && generation.current === current)
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "The request failed. Refresh before trying again.",
        });
    } finally {
      if (generation.current === current) pending.current = false;
    }
  }

  return { state, run, clear: () => setState({ status: "idle" }) };
}

export function OneTimeSecret({
  secret,
  close,
}: {
  secret: SecretValue;
  close: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const id = useId();
  return (
    <section data-ui="one-time-secret" className="rounded-[10px] bg-surface p-5.5 my-6 border border-solid border-accent [&_h3]:text-[19px]" aria-labelledby={id + "-title"}>
      <h3 id={id + "-title"}>Save this value</h3>
      <p data-ui="notice" className="rounded-lg bg-warning-subtle text-warning text-[13px] leading-[1.7] my-4 py-3.5 px-4.25 border border-solid border-border">
        This value is shown once. It is cleared when you leave this view.
      </p>
      <label data-ui="form-field" className="grid mb-4.5 gap-2 [&_>_span]:text-[13px] [&_>_span]:font-medium [&_>_label]:text-[13px] [&_>_label]:font-medium" htmlFor={id}>
        <span>{secret.label}</span>
        <Input className="[[data-ui~='workspace-create-dialog']_&]:bg-surface-hover [[data-ui~='workspace-create-dialog']_&]:border-0 [[data-ui~='workspace-create-dialog']_&]:border-none [[data-ui~='workspace-create-dialog']_&]:border-current [[data-ui~='dashboard-main']_&]:min-h-10 [[data-ui~='dashboard-main']_&]:text-[14px] [[data-ui~='dashboard-main']_&]:py-2.25 [[data-ui~='dashboard-main']_&]:px-3 [[data-ui~='workspace-create-dialog']_&]:focus-visible:outline-hidden [[data-ui~='workspace-create-dialog']_&]:focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] w-full min-h-11.5 rounded-md text-foreground py-2.75 px-3 placeholder:text-muted font-mono text-[13px]"
          id={id}
          value={secret.value}
          type={visible ? "text" : "password"}
          readOnly
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {secret.note && <p className="text-[12px] text-muted leading-[1.7] in-data-[ui~='settings-form']:mt-3 in-data-[ui~='settings-form']:mb-4.5 [[data-ui~='settings-section']_>_&]:mt-3 [[data-ui~='settings-section']_>_&]:mb-5">{secret.note}</p>}
      <div data-ui="form-actions" className="flex items-center flex-wrap gap-2.5 in-data-[ui~='workspace-create-dialog']:flex-row-reverse in-data-[ui~='workspace-create-dialog']:mt-6 in-data-[ui~='data-table']:gap-3.5 [[data-ui~='one-time-secret']_>_&]:mt-4.5">
        <Button
          type="button"
          data-ui="button" variant="secondary" size="small" className="leading-[1.4]"
          onClick={() => setVisible(!visible)}
        >
          {visible ? "Hide" : "Reveal"}
        </Button>
        <CopyButton
          value={secret.value}
          label="Copy"
          successMessage="Copied. Save it securely."
        />
      </div>
      <label className="flex items-start text-[13px] gap-2.5 my-5.5">
        <input className="mt-0.5 accent-accent shrink-0 size-4.5"
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
        />
        I&apos;ve saved this securely.
      </label>
      <Button
        type="button"
        data-ui="button" variant="secondary"
        disabled={!saved}
        onClick={close}
      >
        Dismiss
      </Button>
    </section>
  );
}
