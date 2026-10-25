"use client";

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
  | { status: "idle" }
  | { status: "pending" }
  | { status: "revealed"; receipt: SigningSecretReceipt }
  | { status: "error"; message: string };

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
    <section id="signing-secret" className="endpoint-section">
      <div className="endpoint-section-title">
        <KeyIcon size={21} aria-hidden="true" />
        <h3>Signing secret</h3>
      </div>
      {disclosure.status === "revealed" ? (
        <div className="secret-disclosure">
          <p className="notice notice-warning">
            Save this secret now. It is shown only in this view and is cleared
            when you leave. Store it securely on your receiver, then close it to
            continue setup.
          </p>
          <label className="form-field" htmlFor={id}>
            <span>New signing secret</span>
            <input
              id={id}
              type={visible ? "text" : "password"}
              value={disclosure.receipt.signing_secret}
              readOnly
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="button button-small button-secondary"
              onClick={() => setVisible(!visible)}
            >
              {visible ? (
                <EyeSlashIcon size={17} aria-hidden="true" />
              ) : (
                <EyeIcon size={17} aria-hidden="true" />
              )}
              {visible ? "Hide secret" : "Show secret"}
            </button>
            <CopyButton
              value={disclosure.receipt.signing_secret}
              label="Copy secret"
              successMessage="Signing secret copied. Store it securely on your receiver."
            />
          </div>
          {disclosure.receipt.previous_secret_expires_at && (
            <p className="field-help">
              The previous secret expires at{" "}
              {new Date(
                disclosure.receipt.previous_secret_expires_at,
              ).toLocaleTimeString()}
              . Update your receiver before then.
            </p>
          )}
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={saved}
              onChange={(event) => setSaved(event.target.checked)}
            />
            I&apos;ve saved this secret securely.
          </label>
          <button
            type="button"
            className="button button-secondary"
            disabled={!saved}
            onClick={() => {
              setDisclosure({ status: "idle" });
              setVisible(false);
              setSaved(false);
              onBusyChange(false);
            }}
          >
            Close secret
          </button>
        </div>
      ) : (
        <>
          <p className="section-description">
            {endpoint.has_signing_secret
              ? "A signing secret is configured. Existing secrets cannot be retrieved; rotate only when you need a replacement."
              : "Generate a secret and configure your receiver to validate signed requests."}
          </p>
          {disclosure.status === "error" && (
            <div className="form-error" role="alert">
              <p>{disclosure.message}</p>
              <p>
                The request may have completed. Check the endpoint state before
                generating another secret.
              </p>
            </div>
          )}
          <button
            type="button"
            className="button button-secondary"
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
          </button>
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
