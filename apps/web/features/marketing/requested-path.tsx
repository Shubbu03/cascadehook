"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// The 404 page is prerendered, so the path is only known in the browser.
export function RequestedPath() {
  const path = useSyncExternalStore(subscribe, () => window.location.pathname, () => null);
  return <>{path ?? "/…"}</>;
}
