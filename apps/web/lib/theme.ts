export type ThemePreference = "system" | "light" | "dark";

export const themeStorageKey = "cascadehook-theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

// Runs before paint; ThemeProvider keeps the resolved class synchronized afterward.
export const themeScript =
  '(function(){var t="system";try{var s=localStorage.getItem("cascadehook-theme");if(s==="light"||s==="dark")t=s;}catch(e){t="system";}var r=document.documentElement;r.dataset.theme=t;r.classList.toggle("dark",t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches));})();';
