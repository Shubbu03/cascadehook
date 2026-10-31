"use client";

import { useEffect, useId, useRef, type PointerEvent } from "react";

const VIEW_W = 1200;
const TAU = Math.PI * 2;

const TUNING = {
  rx: 115,
  ry: 85,
  follow: 0.11,
  attack: 0.16,
  release: 0.015,
  fullAt: 60,
  response: 0.6,
  ragged: 0.3,
  boil: 0.02,
  haloScale: 1.14,
  haloPad: 8,
	droplets: 5,
	stretch: 0.5,
};

type Flow = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  tailX: number;
  tailY: number;
  angle: number;
  phase: number;
  energy: number;
  drag: number;
  lastTime: number;
  frame: number | null;
  active: boolean;
};

const smooth = (t: number) => t * t * (3 - 2 * t);

function edgeRadius(theta: number, phase: number) {
  return (
    1 +
    TUNING.ragged *
      (0.5 * Math.sin(theta * 3 + phase) +
        0.32 * Math.sin(theta * 5 - phase * 1.3 + 1.7) +
        0.22 * Math.sin(theta * 8 + phase * 0.9 + 4.1) +
        0.14 * Math.sin(theta * 13 - phase * 1.7 + 0.6))
  );
}

function circle(x: number, y: number, r: number) {
  const f = (n: number) => n.toFixed(1);
  return `M${f(x - r)},${f(y)}a${f(r)},${f(r)} 0 1,1 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,1 ${f(-2 * r)},0Z`;
}

function blobPath(s: Flow, halo: boolean) {
  const e = smooth(Math.min(1, Math.max(0, s.energy)));
  if (e < 0.01) return "";

  const k = halo ? TUNING.haloScale : 1;
  const pad = halo ? TUNING.haloPad : 0;
  const phase = s.phase + (halo ? 0.9 : 0);
  const rx = TUNING.rx * e * k + pad * e;
  const ry = TUNING.ry * e * k + pad * e;
  const cos = Math.cos(s.angle);
  const sin = Math.sin(s.angle);
  const toWorld = (lx: number, ly: number) => ({
    x: s.x + lx * cos - ly * sin,
    y: s.y + lx * sin + ly * cos,
  });

  const drag = s.drag * TUNING.stretch;
  const N = 48;
  const pts = Array.from({ length: N }, (_, i) => {
    const theta = (i / N) * TAU;
    const r = edgeRadius(theta, phase);
    const tail = Math.max(0, -Math.cos(theta)) ** 3;
    const lx = Math.cos(theta) * (rx + drag * 0.25) * r - drag * tail * 0.65;
    const ly = Math.sin(theta) * (ry - drag * 0.08) * r;
    return toWorld(lx, ly);
  });

  const first = pts[0];
  const last = pts[N - 1];
  let d = `M${((first.x + last.x) / 2).toFixed(1)},${((first.y + last.y) / 2).toFixed(1)}`;
  for (let i = 0; i < N; i += 1) {
    const p = pts[i];
    const n = pts[(i + 1) % N];
    d += `Q${p.x.toFixed(1)},${p.y.toFixed(1)} ${((p.x + n.x) / 2).toFixed(1)},${((p.y + n.y) / 2).toFixed(1)}`;
  }
  d += "Z";

  for (let j = 0; j < TUNING.droplets; j += 1) {
    const life = 0.5 + 0.5 * Math.sin(phase * 1.1 + j * 2.3);
    const a = (j / TUNING.droplets) * TAU + Math.sin(phase * 0.6 + j) * 0.6;
    const dist = 0.78 + 0.34 * Math.sin(phase * 0.8 + j * 1.9);
    const r = (10 + 16 * life) * e * k;
    const p = toWorld(Math.cos(a) * rx * dist, Math.sin(a) * ry * dist);
    d += circle(p.x, p.y, r);
  }
  return d;
}

export function FooterWordmark() {
  const uid = useId().replace(/:/g, "");
  const inkMaskId = `${uid}-ink`;
  const haloMaskId = `${uid}-halo`;
  const ink = useRef<SVGPathElement>(null);
  const halo = useRef<SVGPathElement>(null);
  const preference = useRef<MediaQueryList | null>(null);
  const flow = useRef<Flow>({
    x: 600, y: 64, targetX: 600, targetY: 64, tailX: 600, tailY: 64,
    angle: 0, phase: 0, energy: 0, drag: 0, lastTime: 0, frame: null, active: false,
  });

  useEffect(() => {
    preference.current = window.matchMedia("(prefers-reduced-motion: reduce)");
    const current = flow.current;
    return () => {
      current.active = false;
      if (current.frame !== null) window.cancelAnimationFrame(current.frame);
      current.frame = null;
    };
  }, []);

  function draw() {
    const s = flow.current;
    ink.current?.setAttribute("d", blobPath(s, false));
    halo.current?.setAttribute("d", blobPath(s, true));
  }

  function animateInk(time: number) {
    const s = flow.current;
    s.frame = null;

    const elapsed = s.lastTime ? Math.min((time - s.lastTime) / 16.67, 2) : 1;
    s.lastTime = time;
    const rate = (r: number) => 1 - (1 - r) ** elapsed;

    if (preference.current?.matches) {
      s.x = s.tailX = s.targetX;
      s.y = s.tailY = s.targetY;
      s.drag = 0;
      s.energy = s.active ? 0.7 : 0;
      draw();
      return;
    }

    s.phase += elapsed * TUNING.boil;
    s.x += (s.targetX - s.x) * rate(TUNING.follow);
    s.y += (s.targetY - s.y) * rate(TUNING.follow);
    s.tailX += (s.x - s.tailX) * rate(0.07);
    s.tailY += (s.y - s.tailY) * rate(0.07);

    const dx = s.x - s.tailX;
    const dy = s.y - s.tailY;
    s.drag = Math.min(Math.hypot(dx, dy), 180);
    if (s.drag > 2) {
      const turn = Math.atan2(dy, dx) - s.angle;
      s.angle += Math.atan2(Math.sin(turn), Math.cos(turn)) * rate(0.14);
    }

    const lag = Math.hypot(s.targetX - s.x, s.targetY - s.y);
    const target = s.active
      ? Math.min(1, (lag / TUNING.fullAt) ** TUNING.response)
      : 0;
    s.energy += (target - s.energy) * rate(target > s.energy ? TUNING.attack : TUNING.release);

    draw();
    if (s.energy > 0.004 || lag > 0.5 || s.drag > 0.1) {
      s.frame = window.requestAnimationFrame(animateInk);
    } else {
      s.energy = 0;
      draw();
    }
  }

  function kick() {
    const s = flow.current;
    if (s.frame === null) s.frame = window.requestAnimationFrame(animateInk);
  }

  function track(event: PointerEvent<SVGSVGElement>, snap: boolean) {
    if (event.pointerType === "touch") return;
    const { left, top, width } = event.currentTarget.getBoundingClientRect();
    if (!width) return;

    const scale = VIEW_W / width;
    const s = flow.current;
    s.targetX = (event.clientX - left) * scale;
    s.targetY = (event.clientY - top) * scale;
    s.active = true;

    if (snap && s.energy < 0.02) {
      s.x = s.tailX = s.targetX;
      s.y = s.tailY = s.targetY;
      s.drag = 0;
      s.lastTime = 0;
    }
    kick();
  }

  function stopInk() {
    flow.current.active = false;
    kick();
  }

  return (
    <svg
      className="landing-footer-wordmark"
      viewBox="0 0 1200 128"
      aria-hidden="true"
      focusable="false"
      onPointerEnter={(event) => track(event, true)}
      onPointerMove={(event) => track(event, false)}
      onPointerLeave={stopInk}
      onPointerCancel={stopInk}
    >
      <defs>
        <mask id={haloMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="240">
          <path ref={halo} d="" fill="white" />
        </mask>
        <mask id={inkMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="240">
          <path ref={ink} d="" fill="white" />
        </mask>
      </defs>
      <text
        className="landing-wordmark-outline"
        x="16" y="155" textLength="1168" lengthAdjust="spacingAndGlyphs"
        fontSize="200" fontWeight="600"
      >
        cascadehook.
      </text>
      <text
        className="landing-wordmark-halo"
        x="16" y="155" textLength="1168" lengthAdjust="spacingAndGlyphs"
        fontSize="200" fontWeight="600"
        mask={`url(#${haloMaskId})`}
      >
        cascadehook.
      </text>
      <text
        className="landing-wordmark-fill"
        x="16" y="155" textLength="1168" lengthAdjust="spacingAndGlyphs"
        fontSize="200" fontWeight="600"
        mask={`url(#${inkMaskId})`}
      >
        cascadehook.
      </text>
    </svg>
  );
}
