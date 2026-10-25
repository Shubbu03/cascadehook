"use client";

import { ArrowRightIcon, CheckIcon } from "@phosphor-icons/react";
import { useActionState, useId, useState } from "react";
import Link from "next/link";
import type { NameActionState } from "../data-access/form-state";

export function OnboardingForm({
  step,
  action,
  organization,
}: {
  step: "organization" | "project";
  action: (state: NameActionState, form: FormData) => Promise<NameActionState>;
  organization?: { id: string; name: string };
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [name, setName] = useState("");
  const id = useId();
  const isProject = step === "project";

  return (
    <main id="main-content" className="onboarding-content">
      <ol
        className="onboarding-progress"
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
      <div className="onboarding-card">
        <h1>
          {isProject ? "Create your first project" : "Create your organization"}
        </h1>
        {organization && (
          <p className="onboarding-organization">{organization.name}</p>
        )}
        <form action={formAction} aria-busy={pending}>
          {organization && (
            <input
              type="hidden"
              name="organizationId"
              value={organization.id}
            />
          )}
          <label className="form-field" htmlFor={id}>
            <span>{isProject ? "Project name" : "Organization name"}</span>
            <input
              id={id}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={isProject ? "e.g. Billing service" : "e.g. Acme"}
              autoComplete={isProject ? "off" : "organization"}
              disabled={pending}
              aria-describedby={state.error ? id + "-error" : undefined}
              required
            />
          </label>
          {state.error && (
            <p className="form-error" id={id + "-error"} role="alert">
              {state.error}
            </p>
          )}
          <button
            type="submit"
            className="button button-primary"
            disabled={pending}
          >
            {pending ? "Creating…" : isProject ? "Create project" : "Continue"}
            {!pending && <ArrowRightIcon size={17} aria-hidden="true" />}
          </button>
        </form>
      </div>
      {!isProject && (
        <p className="onboarding-invitation">
          <Link href="/invitations/accept" className="text-link">
            Have an invitation? Join an organization
          </Link>
        </p>
      )}
    </main>
  );
}
