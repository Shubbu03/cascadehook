"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation } from "@tanstack/react-query";
import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { ApiError, apiRequest } from "@/lib/api";
import { notify } from "@/lib/notify";

export function RenameForm({ kind, name, path, saved }: {
  kind: string;
  name: string;
  path: string;
  saved: () => Promise<unknown>;
}) {
  const { getToken } = useAuth();
  const id = useId();
  const [value, setValue] = useState(name);
  const [validation, setValidation] = useState("");
  const rename = useMutation({
    mutationFn: (name: string) => apiRequest<unknown>(path, getToken, { method: "PATCH", data: { name } }),
    onSuccess: async () => {
      notify("Name updated.", "success");
      await saved();
    },
  });
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = value.trim();
    if (!next || [...next].length > 100 || /\p{Cc}/u.test(next)) {
      setValidation("Enter a name with 1–100 characters and no control characters.");
      return;
    }
    setValidation("");
    if (next !== name && !rename.isPending) rename.mutate(next);
  }
  const message = validation || rename.error?.message;
  const invalidName = Boolean(validation) || (rename.error instanceof ApiError &&
    (rename.error.code === "invalid_name" || rename.error.code === "project_name_exists"));
  return (
    <form onSubmit={submit} aria-busy={rename.isPending} className="border-b border-border py-5">
      <div className="flex max-w-180 flex-wrap items-end gap-3">
        <label className="grid min-w-0 flex-1 basis-60 gap-2 text-[13px] font-medium" htmlFor={id}>
          {kind} name
          <Input id={id} name="name" value={value} required disabled={rename.isPending}
            className="min-h-10 w-full rounded-md px-3 py-2.5 text-[14px] font-normal max-[37.5rem]:text-[16px]"
            onChange={(event) => { setValue(event.target.value); setValidation(""); rename.reset(); }}
            aria-invalid={invalidName} aria-describedby={message ? id + "-error" : undefined} />
        </label>
        <Button type="submit" size="small" disabled={rename.isPending || value.trim() === name}>
          {rename.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
      {message && <p id={id + "-error"} role="alert" className="mt-3 text-[13px] text-danger">{message}</p>}
    </form>
  );
}
