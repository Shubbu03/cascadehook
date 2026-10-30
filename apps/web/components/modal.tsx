"use client";

import {
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type MouseEvent,
} from "react";

type ModalProps = Omit<
  ComponentPropsWithoutRef<"dialog">,
  "open" | "onCancel" | "onClose" | "onPointerDown" | "closedby"
> & {
  onDismiss: () => void;
  dismissDisabled?: boolean;
};

function isBackdropClick(event: MouseEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  const rect = event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

export function Modal({
  children,
  onDismiss,
  dismissDisabled = false,
  onClick,
  ...props
}: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      {...props}
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!dismissDisabled) onDismiss();
      }}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.button === 0 && isBackdropClick(event);
      }}
      onClick={(event) => {
        onClick?.(event);
        const startedOutside = pressedBackdrop.current;
        pressedBackdrop.current = false;
        if (
          !event.defaultPrevented &&
          !dismissDisabled &&
          startedOutside &&
          isBackdropClick(event)
        ) {
          onDismiss();
        }
      }}
    >
      {children}
    </dialog>
  );
}
