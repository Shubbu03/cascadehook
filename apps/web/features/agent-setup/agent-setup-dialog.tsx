"use client";

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
      className="confirmation-dialog agent-setup-dialog"
      aria-labelledby={id}
      aria-describedby={id + "-description"}
      onDismiss={onClose}
    >
      <div className="agent-setup-heading">
        <div>
          <span className="eyebrow">Connect your application</span>
          <h2 id={id}>Set up with your AI agent</h2>
        </div>
        <button type="button" className="button button-small button-quiet" aria-label="Close agent setup" onClick={onClose}>
          <XIcon size={18} aria-hidden="true" />
        </button>
      </div>
      <p id={id + "-description"}>
        Give your coding agent this project’s context. It can inspect your code,
        connect Cascadehook, and check your first delivery.
      </p>
      {(!availabilityKnown || suspended) && (
        <p className="workspace-banner workspace-banner-warning" role="status">
          {suspended
            ? "This project is paused. You can prepare the integration, but an operator must resume the project before delivery can be tested."
            : "Project availability is unknown. Your agent must check project status before changing setup."}
        </p>
      )}
      <ol className="agent-setup-steps">
        <li>
          <h3>Save a project key locally</h3>
          <p>
            <Link href={projectHref(project.id) + "/api-keys"} className="text-link">Create an API key</Link>{" "}
            and save its one-time value as <code>CASCADEHOOK_API_KEY</code> in
            your application’s local environment or secret manager. Keep it out
            of chat and source control.
          </p>
          <p className="field-help">
            Keys grant project-wide access. Development and Live labels have
            the same permissions. Only share a key with an agent you trust.
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
        <div className="agent-prompt">
          <div className="agent-prompt-heading">
            <label htmlFor={id + "-prompt"}>Your project setup prompt</label>
            <CopyButton value={prompt} label="Copy setup prompt" successMessage="Setup prompt copied. Paste it into your coding agent." />
          </div>
          <textarea id={id + "-prompt"} readOnly value={prompt} rows={8} spellCheck={false} />
          <p className="field-help">Includes project context and documentation links. No credentials are included.</p>
        </div>
      ) : (
        <p className="workspace-banner workspace-banner-warning" role="alert">
          The API address is unavailable. Ask the platform operator to configure
          the API origin before generating a setup prompt.
        </p>
      )}
      <div className="agent-setup-links">
        <DocsLink path="/docs/agents" className="text-link">Agent setup guide →</DocsLink>
        <DocsLink path="/docs/agents.md" className="text-link">Markdown guide</DocsLink>
        <DocsLink path="/openapi.json" className="text-link">API schema</DocsLink>
      </div>
    </Modal>
  );
}
