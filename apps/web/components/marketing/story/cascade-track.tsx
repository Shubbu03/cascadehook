"use client";

import { useEffect, useRef, type ReactNode } from "react";

type TrackNode = { x: number; y: number; top: number; bottom: number; section: HTMLElement | null; start: boolean };

export const cascadePulseEvent = "cascade:pulse";

// Where the travelling event sits in the viewport while scrolling.
const viewportAnchor = 0.55;
// Bezier handle length for a quarter ellipse.
const kappa = 0.5523;

function findLength(ys: number[], lens: number[], target: number) {
  if (target <= ys[0]) return 0;
  if (target >= ys[ys.length - 1]) return lens[lens.length - 1];
  let low = 0;
  let high = ys.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (ys[mid] <= target) low = mid;
    else high = mid;
  }
  const span = ys[high] - ys[low] || 1;
  return lens[low] + ((target - ys[low]) / span) * (lens[high] - lens[low]);
}

// Draws one line through every [data-cascade-node] inside, stepping sideways between sections the way the
// logo's bars step down, and moves the published event along it with the scroll position.
export function CascadeTrack({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const base = useRef<SVGPathElement>(null);
  const fill = useRef<SVGPathElement>(null);
  const comet = useRef<SVGCircleElement>(null);
  const dot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = root.current;
    const canvas = svg.current;
    const basePath = base.current;
    const fillPath = fill.current;
    const cometDot = comet.current;
    const eventDot = dot.current;
    if (!container || !canvas || !basePath || !fillPath || !cometDot || !eventDot) return;

    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let nodes: TrackNode[] = [];
    let nodeLengths: number[] = [];
    let ys: number[] = [];
    let scrollYs: number[] = [];
    let xs: number[] = [];
    let lens: number[] = [];
    let total = 0;
    let frame = 0;
    let cometFrame = 0;

    const pointAt = (length: number) => {
      const index = Math.min(lens.length - 1, Math.max(0, Math.round((length / (total || 1)) * (lens.length - 1))));
      return { x: xs[index] ?? 0, y: ys[index] ?? 0 };
    };

    const measure = () => {
      const box = container.getBoundingClientRect();
      nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-cascade-node]"))
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const section = element.closest("section");
          const sectionRect = section?.getBoundingClientRect() ?? rect;
          return {
            x: rect.left + rect.width / 2 - box.left,
            y: rect.top + rect.height / 2 - box.top,
            top: sectionRect.top - box.top,
            bottom: sectionRect.bottom - box.top,
            section,
            start: element.dataset.cascadeNode === "start",
          };
        });

      canvas.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
      if (nodes.length < 2) {
        basePath.removeAttribute("d");
        fillPath.removeAttribute("d");
        total = 0;
        return;
      }

      let d = `M${nodes[0].x} ${nodes[0].y}`;
      const crossings: [number, number][] = [];
      for (let index = 0; index < nodes.length - 1; index++) {
        const from = nodes[index];
        const to = nodes[index + 1];
        const dx = to.x - from.x;
        if (Math.abs(dx) < 1) {
          d += ` L${to.x} ${to.y}`;
          continue;
        }
        // A rounded step: turn out of the column, run level through the gap between sections, and curve
        // down into the next marker. The level run sits just above the boundary, below any content.
        const run = Math.min(from.bottom - 8, to.y - 24);
        const direction = Math.sign(dx);
        const rx = Math.min(160, Math.abs(dx) / 2);
        const ryOut = Math.max(12, Math.min(120, run - from.y));
        const ryIn = Math.max(12, Math.min(120, to.y - run));
        const leave = run - ryOut;
        const turnOut = from.x + direction * rx;
        const turnIn = to.x - direction * rx;
        d += ` L${from.x} ${leave}`;
        d += ` C${from.x} ${leave + kappa * ryOut} ${turnOut - direction * kappa * rx} ${run} ${turnOut} ${run}`;
        d += ` L${turnIn} ${run}`;
        d += ` C${turnIn + direction * kappa * rx} ${run} ${to.x} ${run + ryIn - kappa * ryIn} ${to.x} ${run + ryIn}`;
        if (run + ryIn < to.y) d += ` L${to.x} ${to.y}`;
        crossings.push([leave, run + ryIn]);
      }
      basePath.setAttribute("d", d);
      fillPath.setAttribute("d", d);
      total = basePath.getTotalLength();
      fillPath.style.strokeDasharray = `${total} ${total}`;

      const steps = Math.max(2, Math.ceil(total / 6));
      ys = [];
      xs = [];
      lens = [];
      for (let step = 0; step <= steps; step++) {
        const length = (total * step) / steps;
        const point = basePath.getPointAtLength(length);
        lens.push(length);
        xs.push(point.x);
        // The path only moves down or sideways, so y never decreases.
        ys.push(Math.max(point.y, ys[ys.length - 1] ?? point.y));
      }
      // Level runs have no vertical extent, so spread each whole crossing over the scroll distance it spans.
      // Otherwise the event would jump across the page in a single frame.
      scrollYs = ys.slice();
      for (const [top, bottom] of crossings) {
        const first = ys.findIndex((y) => y >= top - 0.5);
        const last = ys.findIndex((y, index) => index > first && y >= bottom - 0.5);
        if (first < 0 || last <= first) continue;
        const span = lens[last] - lens[first] || 1;
        for (let index = first; index <= last; index++) {
          scrollYs[index] = top + ((lens[index] - lens[first]) / span) * (bottom - top);
        }
      }
      nodeLengths = nodes.map((node) => findLength(scrollYs, lens, node.y));
    };

    const update = () => {
      if (!total) return;
      const reduced = reducedQuery.matches;
      const box = container.getBoundingClientRect();
      const length = reduced ? total : Math.min(total, Math.max(0, findLength(scrollYs, lens, window.innerHeight * viewportAnchor - box.top)));
      fillPath.style.strokeDashoffset = String(total - length);
      const point = pointAt(length);
      eventDot.style.transform = `translate(${point.x}px, ${point.y}px)`;
      eventDot.style.opacity = reduced ? "0" : "1";
      nodes.forEach((node, index) => {
        if (!node.section || node.start) return;
        node.section.dataset.active = String(length >= nodeLengths[index] - 2);
      });
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    const relayout = () => {
      measure();
      update();
    };

    // Reveal animations shift content while they run, so measure again once they settle.
    let settleFrame = 0;
    const settle = () => {
      if (settleFrame) return;
      settleFrame = requestAnimationFrame(() => {
        settleFrame = 0;
        relayout();
      });
    };

    const pulse = (event: Event) => {
      if (reducedQuery.matches || !total) return;
      const sectionId = (event as CustomEvent<{ from: string }>).detail?.from;
      const index = nodes.findIndex((node) => node.section?.id === sectionId);
      if (index < 0 || index >= nodes.length - 1) return;
      const from = nodeLengths[index];
      const to = nodeLengths[index + 1];
      const started = performance.now();
      cancelAnimationFrame(cometFrame);
      const run = (now: number) => {
        const progress = Math.min(1, (now - started) / 1300);
        const eased = 1 - (1 - progress) ** 3;
        const point = basePath.getPointAtLength(from + (to - from) * eased);
        cometDot.setAttribute("cx", String(point.x));
        cometDot.setAttribute("cy", String(point.y));
        cometDot.style.opacity = String(progress < 0.85 ? 1 : (1 - progress) / 0.15);
        if (progress < 1) cometFrame = requestAnimationFrame(run);
      };
      cometFrame = requestAnimationFrame(run);
    };

    relayout();
    const resizeObserver = new ResizeObserver(relayout);
    resizeObserver.observe(container);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener(cascadePulseEvent, pulse);
    reducedQuery.addEventListener("change", relayout);
    container.addEventListener("animationend", settle);

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(cometFrame);
      cancelAnimationFrame(settleFrame);
      resizeObserver.disconnect();
      container.removeEventListener("animationend", settle);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener(cascadePulseEvent, pulse);
      reducedQuery.removeEventListener("change", relayout);
    };
  }, []);

  return (
    <div ref={root} className="relative">
      <svg ref={svg} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible">
        <path ref={base} fill="none" strokeWidth={1.5} className="stroke-border" />
        <path ref={fill} fill="none" strokeWidth={2} strokeLinecap="round" className="stroke-accent" />
        <circle ref={comet} r={5} className="fill-accent" style={{ opacity: 0 }} />
      </svg>
      {children}
      <div ref={dot} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-2 opacity-0 transition-opacity duration-300 will-change-transform">
        <span className="absolute -top-1.5 -left-1.5 size-3 rounded-full bg-accent shadow-[0_0_0_6px_color-mix(in_srgb,var(--accent)_22%,transparent),0_0_22px_4px_color-mix(in_srgb,var(--accent)_35%,transparent)]" />
      </div>
    </div>
  );
}
