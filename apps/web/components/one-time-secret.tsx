"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CopyButton } from "./copy-button";

export type SecretValue = { value: string; label: string; note?: string };
type SecretState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "revealed"; secret: SecretValue }
  | { status: "error"; message: string };

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
    <section className="one-time-secret" aria-labelledby={id + "-title"}>
      <h3 id={id + "-title"}>Save this value</h3>
      <p className="notice notice-warning">
        This value is shown once. It is cleared when you leave this view.
      </p>
      <label className="form-field" htmlFor={id}>
        <span>{secret.label}</span>
        <input
          id={id}
          value={secret.value}
          type={visible ? "text" : "password"}
          readOnly
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {secret.note && <p className="field-help">{secret.note}</p>}
      <div className="form-actions">
        <button
          type="button"
          className="button button-small button-secondary"
          onClick={() => setVisible(!visible)}
        >
          {visible ? "Hide" : "Reveal"}
        </button>
        <CopyButton
          value={secret.value}
          label="Copy"
          successMessage="Copied. Save it securely."
        />
      </div>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
        />
        I&apos;ve saved this securely.
      </label>
      <button
        type="button"
        className="button button-secondary"
        disabled={!saved}
        onClick={close}
      >
        Dismiss
      </button>
    </section>
  );
}
