"use client";

import { useAuth } from "@clerk/nextjs";
import { XIcon } from "@phosphor-icons/react";
import { Suspense, type ReactNode } from "react";
import toast, { ToastBar, Toaster } from "react-hot-toast";
import { NotificationContext } from "@/lib/notification-context";

export function Notifications({ children }: { children: ReactNode; }) {
  return (
    <NotificationContext.Provider value={true}>
      {children}
      <Suspense fallback={null}>
        <NotificationToaster />
      </Suspense>
    </NotificationContext.Provider>
  );
}

function NotificationToaster() {
  const { isSignedIn } = useAuth();
  if (isSignedIn !== true) return null;

  return (
    <Toaster
      position="top-right"
      gutter={10}
      toastOptions={{
        duration: 3000,
        className: "wrap-anywhere",
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
                  className="grid place-items-center shrink-0 rounded-[5px] bg-transparent text-muted p-0 size-7 border-0 border-none border-current [&:hover]:bg-surface-hover [&:hover]:text-foreground pointer-coarse:size-11"
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
