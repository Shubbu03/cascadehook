"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function LandingMotion({ children }: { children: ReactNode }) {
  const page = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = page.current;
    if (!root) return;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;

    const observeSections = () => {
      observer?.disconnect();
      if (motionPreference.matches || !("IntersectionObserver" in window)) return;

      observer = new IntersectionObserver(
        (entries, currentObserver) => {
          for (const entry of entries) {
            if (!entry.isIntersecting || entry.intersectionRatio < 0.15) continue;
            entry.target.setAttribute("data-visible", "true");
            currentObserver.unobserve(entry.target);
          }
        },
        { threshold: 0.15 },
      );

      root
        .querySelectorAll("[data-motion]:not([data-visible])")
        .forEach((section) => observer?.observe(section));
    };

    observeSections();
    motionPreference.addEventListener("change", observeSections);

    return () => {
      observer?.disconnect();
      motionPreference.removeEventListener("change", observeSections);
    };
  }, []);

  return (
    <div className="landing-page" ref={page}>
      {children}
    </div>
  );
}
