"use client";

import {
  CheckCircleIcon,
  InfoIcon,
  WarningCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import toast, { type ToastOptions } from "react-hot-toast";

export type NotificationType = "success" | "error" | "warn" | "info";

export function notify(message: string, type: NotificationType = "info") {
  const options: ToastOptions = {
    id: type + ":" + message,
    position: "top-right",
    ariaProps: { role: "status", "aria-live": "polite" },
  };
  const iconProps = {
    size: 21,
    weight: "fill" as const,
    "aria-hidden": true as const,
  };

  switch (type) {
    case "success":
      return toast.success(message, {
        ...options,
        duration: 4000,
        icon: <CheckCircleIcon {...iconProps} className="text-success" />,
      });
    case "error":
      return toast.error(message, {
        ...options,
        duration: 5000,
        icon: <WarningCircleIcon {...iconProps} className="text-danger" />,
      });
    case "warn":
      return toast(message, {
        ...options,
        duration: 4000,
        icon: <WarningIcon {...iconProps} className="text-warning" />,
      });
    case "info":
      return toast(message, {
        ...options,
        duration: 3000,
        icon: <InfoIcon {...iconProps} className="text-accent" />,
      });
  }
}
