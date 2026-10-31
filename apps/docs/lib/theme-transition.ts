import { flushSync } from "react-dom";

export type ThemeOrigin = { x: number; y: number };

export async function revealTheme(update: () => void, origin: ThemeOrigin) {
  if (
    typeof document.startViewTransition !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }

  const root = document.documentElement;
  let transition: ViewTransition | undefined;
  let completion: Promise<PromiseSettledResult<void>[]> | undefined;
  let updated = false;
  const commit = () => {
    if (updated) return;
    updated = true;
    flushSync(update);
  };

  try {
    root.dataset.themeTransition = "circular";
    transition = document.startViewTransition(commit);
    completion = Promise.allSettled([transition.finished, transition.updateCallbackDone]);
    await transition.ready;

    const x = Math.max(0, Math.min(origin.x, window.innerWidth));
    const y = Math.max(0, Math.min(origin.y, window.innerHeight));
    const radius = Math.ceil(Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )) + 1;

    await root.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${radius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 520,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        pseudoElement: "::view-transition-new(root)",
      },
    ).finished;
  } catch {
    transition?.skipTransition();
    commit();
  } finally {
    await completion;
    delete root.dataset.themeTransition;
  }
}
