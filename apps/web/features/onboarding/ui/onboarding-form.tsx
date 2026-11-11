"use client";

import { Input } from "@/components/input";

import { Button } from "@/components/button";

import { ArrowRightIcon, CheckIcon } from "@phosphor-icons/react";
import { useActionState, useId, useState } from "react";
import type { NameActionState } from "../data-access/form-state";
import { errorText, formField } from "@/components/styles";

export function OnboardingForm({
  step,
  action,
  organization,
}: {
  step: "organization" | "project";
  action: (state: NameActionState, form: FormData) => Promise<NameActionState>;
  organization?: { id: string; name: string; };
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [name, setName] = useState("");
  const id = useId();
  const isProject = step === "project";

  return (
    <main id="main-content" className="w-[min(460px,calc(100%-40px))] mx-auto">
      <ol
        className={"flex items-center justify-center mt-0 mb-7 list-none gap-8 p-0 mx-0 [&_li]:flex [&_li]:items-center [&_li]:text-muted [&_li]:text-[13px] [&_li]:gap-2.25 [&_li_>_span]:grid [&_li_>_span]:place-items-center [&_li_>_span]:rounded-full [&_li_>_span]:font-mono [&_li_>_span]:text-[11px] [&_li_>_span]:size-6.25 [&_li_>_span]:border [&_li_>_span]:border-solid [&_li_>_span]:border-border **:aria-[aria-current=\"step\"]:text-foreground [&_[aria-current=\"step\"]_>_span]:bg-accent-subtle [&_[aria-current=\"step\"]_>_span]:text-accent [&_[aria-current=\"step\"]_>_span]:border-accent [&_[data-complete=\"true\"]_>_span]:bg-accent-subtle [&_[data-complete=\"true\"]_>_span]:text-accent [&_[data-complete=\"true\"]_>_span]:border-accent"}
        aria-label="Setup progress"
        role="list"
      >
        <li
          aria-current={!isProject ? "step" : undefined}
          data-complete={isProject}
        >
          <span aria-hidden="true">
            {isProject ? <CheckIcon size={14} /> : "1"}
          </span>
          Organization
        </li>
        <li aria-current={isProject ? "step" : undefined}>
          <span aria-hidden="true">2</span>
          Project
        </li>
      </ol>
      <div data-ui="onboarding-card" className="rounded-xl bg-surface p-8 border border-solid border-border [&_h1]:text-[26px] [&_h1]:tracking-[-0.035em] [&_form]:mt-7 max-[37.5rem]:p-6 max-[37.5rem]:[&_h1]:text-[24px]">
        <h1>
          {isProject ? "Create your first project" : "Create your organization"}
        </h1>
        {organization && (
          <p className="mt-2.5 text-muted text-[14px] wrap-anywhere">{organization.name}</p>
        )}
        <form action={formAction} aria-busy={pending}>
          {organization && (
            <input
              type="hidden"
              name="organizationId"
              value={organization.id}
            />
          )}
          <label className={formField} htmlFor={id}>
            <span>{isProject ? "Project name" : "Organization name"}</span>
            <Input className="w-full min-h-11.5 rounded-md text-foreground text-[16px] py-2.75 px-3 placeholder:text-muted bg-surface-hover shadow-[inset_0_-2px_transparent] transition-shadow border-0 border-none border-current focus-visible:outline-hidden focus-visible:shadow-[inset_0_-2px_var(--accent)]"
              id={id}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={isProject ? "e.g. Billing service" : "e.g. Acme"}
              autoComplete={isProject ? "off" : "organization"}
              disabled={pending}
              aria-invalid={
                state.code === "invalid_name" || state.code === "project_name_exists"
              }
              aria-describedby={state.error ? id + "-error" : undefined}
              required
            />
          </label>
          {state.error && (
            <p className={errorText} id={id + "-error"} role="alert">
              {state.error}
            </p>
          )}
          <Button
            type="submit"
            data-ui="button" className="w-full mt-1.5"
            disabled={pending}
          >
            {pending ? "Creating…" : isProject ? "Create project" : "Continue"}
            {!pending && <ArrowRightIcon size={17} aria-hidden="true" />}
          </Button>
        </form>
      </div>
      {!isProject && (
        <p className="mt-5.5 text-center text-muted text-[13px]">
          Have an invitation? Open the link in your invitation email.
        </p>
      )}
    </main>
  );
}
