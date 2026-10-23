"use client";

import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import { notify } from "@/lib/notify";
import {
  isThemePreference,
  themeStorageKey,
  type ThemePreference,
} from "@/lib/theme";

const changeEvent = "cascadehook-theme-change";

function currentTheme(): ThemePreference {
  const value = document.documentElement.dataset.theme;
  return isThemePreference(value) ? value : "system";
}

function subscribe(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== themeStorageKey && event.key !== null) return;
    document.documentElement.dataset.theme = isThemePreference(event.newValue)
      ? event.newValue
      : "system";
    onChange();
  }
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function serverTheme(): ThemePreference {
  return "system";
}

export function ThemeSwitcher() {
  const theme = useSyncExternalStore(subscribe, currentTheme, serverTheme);
  const Icon =
    theme === "light" ? SunIcon : theme === "dark" ? MoonIcon : DesktopIcon;

  function changeTheme(value: string) {
    if (!isThemePreference(value)) return;
    document.documentElement.dataset.theme = value;
    window.dispatchEvent(new Event(changeEvent));
    try {
      localStorage.setItem(themeStorageKey, value);
    } catch {
      notify(
        "Theme changed for this visit. Your browser couldn't save it.",
        "warn",
      );
    }
  }

  return (
    <label className="theme-switcher">
      <Icon size={17} aria-hidden="true" />
      <span className="sr-only">Color theme</span>
      <select
        value={theme}
        onChange={(event) => changeTheme(event.target.value)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
