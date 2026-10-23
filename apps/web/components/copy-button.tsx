"use client";

import { CopyIcon } from "@phosphor-icons/react";
import { notify } from "@/lib/notify";

export function CopyButton({
  value,
  label = "Copy",
  successMessage = "Copied to clipboard.",
}: {
  value: string;
  label?: string;
  successMessage?: string;
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      notify(successMessage, "success");
    } catch {
      notify("Couldn't copy. Select the text and copy it manually.", "error");
    }
  }
  return (
    <button
      type="button"
      className="button button-small button-quiet"
      onClick={copy}
    >
      <CopyIcon size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
