"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

const reducedQuery = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// The server renders the reduced (final) state, so content is complete before hydration.
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => true);
}

export function useInView<T extends Element>(ref: RefObject<T | null>, threshold = 0.35) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || !("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setInView(true);
      observer.disconnect();
    }, { threshold });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return inView;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

export function useCountUp(target: number, duration = 450) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    if (reduced) {
      current.current = target;
      return;
    }
    const from = current.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const next = Math.round(from + (target - from) * easeOut(progress));
      current.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);

  return reduced ? target : value;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
