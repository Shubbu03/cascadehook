"use client";

import { Textarea } from "@/components/input";

import { Button } from "@/components/button";

import { XIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId } from "react";
import { CopyButton } from "@/components/copy-button";
import { DocsLink } from "@/components/docs-link";
import { Modal } from "@/components/modal";
import { projectHref, useProject } from "@/features/projects/project-workspace";
import { buildSetupPrompt, integrationAPIBaseURL } from "./prompt";

export function AgentSetupDialog({ siteOrigin, onClose }: {
  siteOrigin: string;
  onClose: () => void;
}) {
  const { project, suspended, availabilityKnown } = useProject();
  const id = useId();
  const apiBaseURL = integrationAPIBaseURL(process.env.NEXT_PUBLIC_API_BASE_URL);
  const prompt = apiBaseURL ? buildSetupPrompt({ project, apiBaseURL, siteOrigin }) : null;

  return (
    <Modal
      data-ui="confirmation-dialog" className="w-[min(720px,calc(100%-40px))] max-h-[calc(100svh-48px)] rounded-xl bg-surface text-foreground shadow-floating overflow-y-auto m-auto p-7 border border-solid border-border [&_h2]:text-[22px] [&_h2]:tracking-[-0.03em] [&_p]:mt-4 [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.8] [&_code]:text-[0.9em] [&_code]:wrap-anywhere [&_code]:text-foreground backdrop:bg-[#0008] max-[32.5rem]:p-5.75"
      aria-labelledby={id}
      aria-describedby={id + "-description"}
      onDismiss={onClose}
    >
      <div data-ui="agent-setup-heading" className="flex items-start justify-between gap-3">
        <div>
          <span className="font-medium text-[11px] leading-normal font-mono tracking-[0.02em] block mb-2 text-muted">Connect your application</span>
          <h2 id={id}>Set up with your AI agent</h2>
        </div>
        <Button type="button" data-ui="button" variant="quiet" size="small" className="leading-[1.4]" aria-label="Close agent setup" onClick={onClose}>
          <XIcon size={18} aria-hidden="true" />
        </Button>
      </div>
      <p id={id + "-description"}>
        Give your coding agent this project’s context. It can inspect your code,
        connect Cascadehook, and check your first delivery.
      </p>
      {(!availabilityKnown || suspended) && (
        <p data-ui="workspace-banner" className="flex items-center flex-wrap mt-0 mb-5 rounded-md text-warning bg-warning-subtle text-[12px] leading-[1.6] gap-2.5 py-2.5 px-3 mx-0 border border-solid border-border" role="status">
          {suspended
            ? "This project is paused. You can prepare the integration, but an operator must resume the project before delivery can be tested."
            : "Project availability is unknown. Your agent must check project status before changing setup."}
        </p>
      )}
      <ol className="grid pl-5.5 text-[13px] gap-5 my-6 [&_li]:pl-1.5 [&_h3]:text-[14px] [&_h3]:font-medium [&_p]:mt-1.5 [&_p]:text-[13px] [&_li::marker]:text-accent [&_li::marker]:font-mono">
        <li>
          <h3>Save a project key locally</h3>
          <p>
            <Link href={projectHref(project.id) + "/api-keys"} className="inline-flex items-center text-[14px] font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='project-overview']:text-[12px] in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]">Create an API key</Link>{" "}
            and save its one-time value as <code>CASCADEHOOK_API_KEY</code> in
            your application’s local environment or secret manager. Keep it out
            of chat and source control.
          </p>
          <p className="text-[12px] text-muted leading-[1.7] in-data-[ui~='agent-prompt']:mt-2 in-data-[ui~='agent-prompt']:text-[12px]">
            The agent needs a Full access key to register endpoints. Give
            your deployed application a separate Publish only key. Only share
            a key with an agent you trust.
          </p>
        </li>
        <li>
          <h3>Paste the prompt into your coding agent</h3>
          <p>
            Open your application’s repository with your agent. It will ask for
            your business event and a public HTTPS receiver if needed.
          </p>
        </li>
        <li>
          <h3>Confirm a successful delivery</h3>
          <p>
            Ask your agent for the test event and delivery IDs. Check the
            delivery here; an accepted event alone does not confirm delivery.
          </p>
        </li>
      </ol>
      {prompt ? (
        <div data-ui="agent-prompt" className="pt-5 border-t [border-top-style:solid] border-t-border">
          <div className="flex items-center justify-between flex-wrap mb-3 text-[13px] gap-3">
            <label htmlFor={id + "-prompt"}>Your project setup prompt</label>
            <CopyButton value={prompt} label="Copy setup prompt" successMessage="Setup prompt copied. Paste it into your coding agent." />
          </div>
          <Textarea className="block w-full min-h-45 max-h-105 resize-y rounded-md bg-background text-foreground font-normal text-[12px] leading-[1.8] font-mono p-3.5 border border-solid border-border max-[32.5rem]:text-[16px]" id={id + "-prompt"} readOnly value={prompt} rows={8} spellCheck={false} />
          <p className="text-muted mt-2 text-[12px]">Includes project context and documentation links. No credentials are included.</p>
        </div>
      ) : (
        <p data-ui="workspace-banner" className="flex items-center flex-wrap mt-0 mb-5 rounded-md text-warning bg-warning-subtle text-[12px] leading-[1.6] gap-2.5 py-2.5 px-3 mx-0 border border-solid border-border" role="alert">
          The API address is unavailable. Ask the platform operator to configure
          the API origin before generating a setup prompt.
        </p>
      )}
      <div className="flex items-center justify-start gap-y-3 gap-x-5 flex-wrap mt-6 text-[12px]">
        <DocsLink path="/docs/agents" className="inline-flex items-center text-[14px] font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='project-overview']:text-[12px] in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]">Agent setup guide →</DocsLink>
        <DocsLink path="/docs/agents.md" className="inline-flex items-center text-[14px] font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='project-overview']:text-[12px] in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]">Markdown guide</DocsLink>
        <DocsLink path="/openapi.json" className="inline-flex items-center text-[14px] font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='project-overview']:text-[12px] in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]">API schema</DocsLink>
      </div>
    </Modal>
  );
}
