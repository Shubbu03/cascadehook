"use client";

import { Button } from "@/components/button";
import { cn } from "@/lib/classes";
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
    <Button
      type="button"
      variant="quiet"
      size="small"
      className={cn(
        "data-[copy-state=copied]:bg-success-subtle data-[copy-state=copied]:text-success data-[copy-state=error]:bg-danger-subtle data-[copy-state=error]:text-danger",
        "in-data-[ui~='landing-code-header']:min-w-33",
        iconOnly && "in-data-[ui~='endpoint-destination-url']:shrink-0 in-data-[ui~='endpoint-metadata']:shrink-0 in-data-[ui~='event-identifier']:size-8 in-data-[ui~='event-identifier']:min-h-8 in-data-[ui~='event-identifier']:p-1.5 in-data-[ui~='member-identity']:w-9 in-data-[ui~='member-identity']:p-0 in-data-[ui~='delivery-identifier']:w-7.5 in-data-[ui~='delivery-identifier']:min-h-7.5 in-data-[ui~='delivery-identifier']:p-1.25 in-data-[ui~='delivery-copy-value']:w-7.5 in-data-[ui~='delivery-copy-value']:min-h-7.5 in-data-[ui~='delivery-copy-value']:p-1.25",
      )}
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
    </Button>
  );
}
