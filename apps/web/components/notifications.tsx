"use client";

import { XIcon } from "@phosphor-icons/react";
import toast, { ToastBar, Toaster } from "react-hot-toast";

export function Notifications() {
  return (
    <Toaster
      position="top-right"
      gutter={10}
      containerClassName="notification-container"
      toastOptions={{
        duration: 3000,
        className: "notification",
        style: {
          background: "var(--surface)",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-popover)",
          fontFamily: "var(--font-plex-sans), sans-serif",
          fontWeight: 500,
          borderRadius: "12px",
          fontSize: "14px",
          padding: "12px 16px",
          maxWidth: "min(400px, calc(100vw - 32px))",
        },
      }}
    >
      {(notification) => (
        <ToastBar toast={notification}>
          {({ icon, message }) => (
            <>
              {icon}
              {message}
              {notification.type !== "loading" && (
                <button
                  type="button"
                  className="toast-dismiss"
                  aria-label="Dismiss notification"
                  onClick={() => toast.dismiss(notification.id)}
                >
                  <XIcon size={16} aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </ToastBar>
      )}
    </Toaster>
  );
}
