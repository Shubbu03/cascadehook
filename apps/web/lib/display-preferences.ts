"use client";

import { useCallback, useSyncExternalStore } from "react";
import { formatTime } from "./format";

type TimezonePreference = "utc" | "local";
const storageKey = "cascadehook-timezone";
const changeEvent = "cascadehook-timezone-change";

function snapshot(): TimezonePreference {
  return document.documentElement.dataset.timezone === "local" ? "local" : "utc";
}

function apply(value: string | null) {
  document.documentElement.dataset.timezone = value === "local" ? "local" : "utc";
  window.dispatchEvent(new Event(changeEvent));
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) apply(event.newValue);
  };
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  try { apply(localStorage.getItem(storageKey)); } catch { onChange(); }
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function serverSnapshot(): TimezonePreference { return "utc"; }

export function setTimezone(value: TimezonePreference) {
  apply(value);
  try { localStorage.setItem(storageKey, value); return true; } catch { return false; }
}

export function useTimezonePreference() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function useFormatTime() {
  const timezone = useTimezonePreference();
  return useCallback((value: string | null | undefined) => formatTime(value, timezone), [timezone]);
}
