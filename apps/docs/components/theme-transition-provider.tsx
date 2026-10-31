"use client";

import { ThemeSwitch } from "fumadocs-ui/layouts/shared/slots/theme-switch";
import { useTheme } from "fumadocs-ui/provider/base";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import { revealTheme, type ThemeOrigin } from "@/lib/theme-transition";

const ThemeTransitionContext = createContext<((origin: ThemeOrigin) => Promise<void>) | null>(null);

export function ThemeTransitionProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme();
  const changing = useRef(false);

  const toggleTheme = useCallback(async (origin: ThemeOrigin) => {
    if (changing.current) return;
    changing.current = true;
    try {
      await revealTheme(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"), origin);
    } finally {
      changing.current = false;
    }
  }, [resolvedTheme, setTheme]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
        event.metaKey || event.ctrlKey || event.altKey || event.key.toLowerCase() !== "d"
      ) return;

      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.closest('[role="dialog"]')
      )) return;

      event.preventDefault();
      void toggleTheme({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleTheme]);

  return <ThemeTransitionContext.Provider value={toggleTheme}>{children}</ThemeTransitionContext.Provider>;
}

export function DocsThemeSwitch() {
  const toggleTheme = useContext(ThemeTransitionContext);
  if (!toggleTheme) throw new Error("ThemeTransitionProvider is required.");

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    // Replace Fumadocs' default crossfade before its button handler runs.
    event.preventDefault();
    event.stopPropagation();
    const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
    const origin = event.detail === 0
      ? { x: left + width / 2, y: top + height / 2 }
      : { x: event.clientX, y: event.clientY };
    void toggleTheme(origin);
  };

  return (
    <div className="flex w-fit self-end" onClickCapture={onClick}>
      <ThemeSwitch />
    </div>
  );
}
