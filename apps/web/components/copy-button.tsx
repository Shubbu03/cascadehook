"use client";

import { CheckIcon, CopyIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useContext, useEffect, useRef, useState } from "react";
import { NotificationContext } from "@/lib/notification-context";
import { notify } from "@/lib/notify";

const copyError = "Couldn't copy. Select the text and copy it manually.";

export function CopyButton({
  value,
  label = "Copy",
  successMessage = "Copied to clipboard.",
  iconOnly = false,
}: {
  value: string;
  label?: string;
  successMessage?: string;
  iconOnly?: boolean;
}) {
  const notificationsEnabled = useContext(NotificationContext);
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const resetTimer = useRef<number | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  async function copy() {
    if (status === "copying") return;
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    setStatus("copying");
    let outcome: "copied" | "error";
    try {
      await navigator.clipboard.writeText(value);
      outcome = "copied";
    } catch {
      outcome = "error";
    }
    if (!mounted.current) return;
    if (notificationsEnabled) {
      notify(outcome === "copied" ? successMessage : copyError, outcome === "copied" ? "success" : "error");
      setStatus("idle");
      return;
    }
    setStatus(outcome);
    resetTimer.current = window.setTimeout(() => setStatus("idle"), outcome === "copied" ? 2200 : 4000);
  }

  const text = status === "copied" ? "Copied" : status === "error" ? "Copy failed" : status === "copying" ? "Copying…" : label;
  const Icon = status === "copied" ? CheckIcon : status === "error" ? WarningCircleIcon : CopyIcon;

  return (
    <button
      type="button"
      className={
        "button button-small button-quiet copy-button" +
        (iconOnly ? " copy-button-icon" : "")
      }
      data-copy-state={status}
      aria-label={iconOnly ? text : undefined}
      aria-busy={status === "copying"}
      title={status === "error" ? copyError : iconOnly ? text : undefined}
      disabled={status === "copying"}
      onClick={copy}
    >
      <Icon size={16} aria-hidden="true" />
      <span className={iconOnly ? "sr-only" : undefined} aria-live="polite">
        {iconOnly && status === "idle" ? "" : text}
      </span>
    </button>
  );
}
