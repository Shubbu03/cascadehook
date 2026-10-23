export type ThemePreference = "system" | "light" | "dark";

export const themeStorageKey = "cascadehook-theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

// Runs before paint. CSS handles system changes without a JavaScript listener.
export const themeScript =
  '(function(){var t="system";try{var s=localStorage.getItem("cascadehook-theme");if(s==="light"||s==="dark")t=s;}catch(e){t="system";}document.documentElement.dataset.theme=t;})();';
