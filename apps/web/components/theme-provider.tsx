"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { isThemePreference, themeStorageKey, type ThemePreference } from "@/lib/theme";
import { revealTheme, type ThemeOrigin } from "@/lib/theme-transition";

const changeEvent = "cascadehook-theme-change";
const systemQuery = "(prefers-color-scheme: dark)";

const ThemeContext = createContext<{
  theme: ThemePreference;
  toggleTheme: (origin: ThemeOrigin) => Promise<boolean | undefined>;
} | null>(null);

function preference(): ThemePreference {
  const value = document.documentElement.dataset.theme;
  return isThemePreference(value) ? value : "system";
}

function currentTheme(): "light" | "dark" {
  const value = preference();
  return value === "system"
    ? window.matchMedia(systemQuery).matches ? "dark" : "light"
    : value;
}

function applyTheme(value: ThemePreference) {
  const root = document.documentElement;
  root.dataset.theme = value;
  root.classList.toggle("dark", currentTheme() === "dark");
  window.dispatchEvent(new Event(changeEvent));
}

function subscribe(onChange: () => void) {
  const systemTheme = window.matchMedia(systemQuery);
  const onSystemChange = () => {
    if (preference() === "system") applyTheme("system");
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== themeStorageKey && event.key !== null) return;
    applyTheme(isThemePreference(event.newValue) ? event.newValue : "system");
  };

  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  systemTheme.addEventListener("change", onSystemChange);
  applyTheme(preference());

  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onStorage);
    systemTheme.removeEventListener("change", onSystemChange);
  };
}

function serverTheme(): ThemePreference {
  return "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore<ThemePreference>(subscribe, currentTheme, serverTheme);
  const changing = useRef(false);

  const toggleTheme = useCallback(async (origin: ThemeOrigin) => {
    if (changing.current) return;
    changing.current = true;
    const next = currentTheme() === "dark" ? "light" : "dark";
    let persisted = true;

    try {
      await revealTheme(() => {
        applyTheme(next);
        try {
          localStorage.setItem(themeStorageKey, next);
        } catch {
          persisted = false;
        }
      }, origin);
      return persisted;
    } finally {
      changing.current = false;
    }
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeProvider is required.");
  return context;
}
