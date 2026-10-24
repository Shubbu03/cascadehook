"use client";

import { MoonIcon, SunIcon } from "@phosphor-icons/react";
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
  if (value === "light" || value === "dark") return value;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function subscribe(onChange: () => void) {
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

  function onStorage(event: StorageEvent) {
    if (event.key !== themeStorageKey && event.key !== null) return;
    document.documentElement.dataset.theme = isThemePreference(event.newValue)
      ? event.newValue
      : "system";
    onChange();
  }
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  systemTheme.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onStorage);
    systemTheme.removeEventListener("change", onChange);
  };
}

function serverTheme(): ThemePreference {
  return "system";
}

export function ThemeSwitcher() {
  const theme = useSyncExternalStore(subscribe, currentTheme, serverTheme);
  const label =
    theme === "system"
      ? "Toggle color theme"
      : `Switch to ${theme === "dark" ? "light" : "dark"} theme`;

  function toggleTheme() {
    const value = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = value;
    window.dispatchEvent(new Event(changeEvent));
    try {
      localStorage.setItem(themeStorageKey, value);
    } catch {
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
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <SunIcon size={20} className="theme-icon-light" aria-hidden="true" />
      <MoonIcon size={20} className="theme-icon-dark" aria-hidden="true" />
    </button>
  );
}
