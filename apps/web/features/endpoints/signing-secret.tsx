"use client";

import { Status } from "@/components/status";

import { Input } from "@/components/input";

import { Button } from "@/components/button";

import { useAuth } from "@clerk/nextjs";
import { EyeIcon, EyeSlashIcon, KeyIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { useProject } from "@/features/projects/project-workspace";
import { useSessionUserId } from "@/features/workspace/session";
import { apiRequest } from "@/lib/api";
import { notify } from "@/lib/notify";
import {
  endpointKeys,
  endpointPath,
  type Endpoint,
  type SigningSecretReceipt,
} from "./types";

type Disclosure =
  | { status: "idle"; }
  | { status: "pending"; }
  | { status: "revealed"; receipt: SigningSecretReceipt; }
  | { status: "error"; message: string; };

export function SigningSecret({
  endpoint,
  busy,
  onBusyChange,
}: {
  endpoint: Endpoint;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { project } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const id = useId();
  const [disclosure, setDisclosure] = useState<Disclosure>({ status: "idle" });
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmRotation, setConfirmRotation] = useState(false);
  const active = useRef(false);
  const pending = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      generation.current += 1;
      pending.current = false;
      onBusyChange(false);
      // Next's Activity navigation can hide routes while preserving state.
      // Clear the one-time credential when this view is hidden as well as unmounted.
      setDisclosure({ status: "idle" });
      setVisible(false);
      setSaved(false);
      setConfirmRotation(false);
    };
  }, [onBusyChange]);

  async function generate() {
    if (pending.current || busy) return;
    pending.current = true;
    const requestGeneration = ++generation.current;
    let revealed = false;
    onBusyChange(true);
    setConfirmRotation(false);
    setDisclosure({ status: "pending" });
    setVisible(false);
    setSaved(false);
    try {
      // Deliberately not a query/mutation: the response must never enter its cache.
      const receipt = await apiRequest<SigningSecretReceipt>(
        endpointPath(project.id, endpoint.id) + "/signing-secret",
        getToken,
        { method: "POST" },
      );
      if (
        receipt.endpoint_id !== endpoint.id ||
        !/^whsec_[A-Za-z0-9+/]{43}=$/.test(receipt.signing_secret)
      ) {
        throw new Error(
          "The secret response was incomplete. Refresh the endpoint before trying again.",
        );
      }
      if (active.current && generation.current === requestGeneration) {
        revealed = true;
        setDisclosure({ status: "revealed", receipt });
        notify(
          "Signing secret generated. Save it before leaving this page.",
          "info",
        );
      }
    } catch (error) {
      if (active.current && generation.current === requestGeneration) {
        const message =
          error instanceof Error
            ? error.message
            : "Couldn't retrieve the signing secret.";
        setDisclosure({ status: "error", message });
        notify(message, "error");
      }
    } finally {
      if (generation.current === requestGeneration) {
        pending.current = false;
        if (!revealed) onBusyChange(false);
      }
      void queryClient.invalidateQueries({
        queryKey: endpointKeys.detail(userId, project.id, endpoint.id),
      });
      void queryClient.invalidateQueries({
        queryKey: endpointKeys.lists(userId, project.id),
      });
    }
  }

  return (
    <section
      id="signing-secret"
      data-ui="endpoint-security-card" className="min-w-0 py-5 px-5.5 [[data-ui~='endpoint-security-card']+&]:border-l [[data-ui~='endpoint-security-card']+&]:[border-left-style:solid] [[data-ui~='endpoint-security-card']+&]:border-l-border @max-[38.75rem]/endpoint-settings:p-4 @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:border-t @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:[border-top-style:solid] @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:border-t-border @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:border-l-0 @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:[border-left-style:none] @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:border-l-[currentColor]"
      aria-labelledby={id + "-title"}
    >
      <div data-ui="endpoint-panel-heading" className="flex items-center flex-wrap gap-2 [&_>_svg]:shrink-0 [&_>_svg]:text-muted [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_h2]:text-sm/normal">
        <KeyIcon size={18} aria-hidden="true" />
        <h2 id={id + "-title"}>Signing secret</h2>
        <Status
          tone={(endpoint.has_signing_secret ? "success" : "warning")}
        >
          {endpoint.has_signing_secret ? "Configured" : "Not configured"}
        </Status>
      </div>
      {disclosure.status === "revealed" ? (
        <div data-ui="secret-disclosure" className="mt-3">
          <p data-ui="notice" className="rounded-lg bg-warning-subtle text-warning text-[13px] leading-[1.7] my-4 py-3.5 px-4.25 border border-solid border-border in-data-[ui~='endpoint-inline-fields']:mt-3 in-data-[ui~='endpoint-inline-fields']:mb-0 in-data-[ui~='endpoint-inline-fields']:text-[12px] in-data-[ui~='endpoint-inline-fields']:py-2.5 in-data-[ui~='endpoint-inline-fields']:px-3 [[data-ui~='endpoint-security-card']_[data-ui~='secret-disclosure']_&]:mt-0 [[data-ui~='endpoint-security-card']_[data-ui~='secret-disclosure']_&]:mb-4 [[data-ui~='endpoint-security-card']_[data-ui~='secret-disclosure']_&]:text-[12px] [[data-ui~='endpoint-security-card']_[data-ui~='secret-disclosure']_&]:py-2.5 [[data-ui~='endpoint-security-card']_[data-ui~='secret-disclosure']_&]:px-3">
            Save this secret now. It is shown only in this view and is cleared
            when you leave. Store it securely on your receiver, then close it to
            continue setup.
          </p>
          <label data-ui="form-field" className="grid mb-4.5 gap-2 [&_>_span]:text-[13px] [&_>_span]:font-medium [&_>_label]:text-[13px] [&_>_label]:font-medium in-data-[ui~='endpoint-inline-fields']:mb-0" htmlFor={id}>
            <span>New signing secret</span>
            <Input className="[[data-ui~='workspace-create-dialog']_&]:bg-surface-hover [[data-ui~='workspace-create-dialog']_&]:border-0 [[data-ui~='workspace-create-dialog']_&]:border-none [[data-ui~='workspace-create-dialog']_&]:border-current [[data-ui~='dashboard-main']_&]:min-h-10 [[data-ui~='dashboard-main']_&]:text-[14px] [[data-ui~='dashboard-main']_&]:py-2.25 [[data-ui~='dashboard-main']_&]:px-3 [[data-ui~='workspace-create-dialog']_&]:focus-visible:outline-hidden [[data-ui~='workspace-create-dialog']_&]:focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] w-full min-h-11.5 rounded-md text-foreground py-2.75 px-3 placeholder:text-muted font-mono text-[13px] max-[32.5rem]:text-[16px]"
              id={id}
              type={visible ? "text" : "password"}
              value={disclosure.receipt.signing_secret}
              readOnly
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div data-ui="form-actions" className="flex items-center flex-wrap gap-1.5 in-data-[ui~='workspace-create-dialog']:flex-row-reverse in-data-[ui~='workspace-create-dialog']:mt-6">
            <Button
              type="button"
              data-ui="button" variant="secondary" size="small" className="leading-[1.4]"
              onClick={() => setVisible(!visible)}
            >
              {visible ? (
                <EyeSlashIcon size={17} aria-hidden="true" />
              ) : (
                <EyeIcon size={17} aria-hidden="true" />
              )}
              {visible ? "Hide secret" : "Show secret"}
            </Button>
            <CopyButton
              value={disclosure.receipt.signing_secret}
              label="Copy secret"
              successMessage="Signing secret copied. Store it securely on your receiver."
            />
          </div>
          {disclosure.receipt.previous_secret_expires_at && (
            <p className="text-[12px] text-muted leading-[1.7] mt-3.75">
              The previous secret expires at{" "}
              {new Date(
                disclosure.receipt.previous_secret_expires_at,
              ).toLocaleTimeString()}
              . Update your receiver before then.
            </p>
          )}
          <label className="flex items-start text-[13px] gap-2.5 my-5.5">
            <input className="mt-0.5 accent-accent shrink-0 size-4.5"
              type="checkbox"
              checked={saved}
              onChange={(event) => setSaved(event.target.checked)}
            />
            I&apos;ve saved this secret securely.
          </label>
          <Button
            type="button"
            data-ui="button" variant="secondary"
            disabled={!saved}
            onClick={() => {
              setDisclosure({ status: "idle" });
              setVisible(false);
              setSaved(false);
              onBusyChange(false);
            }}
          >
            Close secret
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-2 mb-3.5 text-muted text-[13px] leading-[1.65] wrap-anywhere [[data-ui~='endpoint-security-card']_>_&:last-child]:mb-0">
            {endpoint.has_signing_secret
              ? "Your secret is configured and cannot be retrieved. Rotate it only when you need a replacement."
              : "Generate a secret and configure your receiver to validate signed requests."}
          </p>
          {disclosure.status === "error" && (
            <div className="text-danger text-[13px] my-3 [[data-ui~='endpoint-danger']_>_&]:basis-full [[data-ui~='endpoint-danger']_>_&]:text-danger" role="alert">
              <p>{disclosure.message}</p>
              <p>
                The request may have completed. Check the endpoint state before
                generating another secret.
              </p>
            </div>
          )}
          <Button
            type="button"
            data-ui="button" variant="secondary" size="small" className="leading-[1.4]"
            disabled={busy || disclosure.status === "pending"}
            onClick={() => {
              if (endpoint.has_signing_secret) setConfirmRotation(true);
              else void generate();
            }}
          >
            {disclosure.status === "pending"
              ? "Generating…"
              : endpoint.has_signing_secret
                ? "Rotate signing secret"
                : "Generate signing secret"}
          </Button>
        </>
      )}
      {confirmRotation && (
        <ConfirmDialog
          title="Rotate this signing secret?"
          confirmLabel="Rotate secret"
          onConfirm={() => {
            void generate();
          }}
          onCancel={() => setConfirmRotation(false)}
        >
          <p>
            Save the new secret and update your receiver immediately. The
            previous credential remains valid for five minutes, and you cannot
            rotate again during that grace period.
          </p>
          <p>
            Delivery settings stay unchanged. An enabled endpoint will continue
            sending signed requests.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
