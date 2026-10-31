"use client";

import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useContext, type MouseEvent } from "react";
import { useTheme } from "@/components/theme-provider";
import { NotificationContext } from "@/lib/notification-context";
import { notify } from "@/lib/notify";

export function ThemeSwitcher() {
  const notificationsEnabled = useContext(NotificationContext);
  const { theme, toggleTheme } = useTheme();
  const label =
    theme === "system"
      ? "Toggle color theme"
      : `Switch to ${theme === "dark" ? "light" : "dark"} theme`;

  async function toggle(event: MouseEvent<HTMLButtonElement>) {
    const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
    const origin = event.detail === 0
      ? { x: left + width / 2, y: top + height / 2 }
      : { x: event.clientX, y: event.clientY };
    const persisted = await toggleTheme(origin);
    if (persisted === false && notificationsEnabled) {
      notify(
        "Theme changed. Your browser couldn't save the preference.",
        "warn",
      );
    }
  }

  return (
    <button
      type="button"
      className="theme-switcher"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <SunIcon size={20} className="theme-icon-light" aria-hidden="true" />
      <MoonIcon size={20} className="theme-icon-dark" aria-hidden="true" />
    </button>
  );
}
