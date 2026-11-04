import { ImageResponse } from "next/og";

// Rendered once at build time and shared by every page under the root segment.
export const alt = "Cascadehook — Webhooks, taken care of.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Dark theme tokens from globals.css. The image renderer cannot read CSS variables.
const background = "#111214";
const foreground = "#f0efec";
const muted = "#a3a5aa";
const accent = "#ed9c72";
const border = "#303236";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "72px 80px", background, color: foreground }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ width: 34, height: 9, borderRadius: 2, background: accent }} />
            <div style={{ width: 34, height: 9, borderRadius: 2, background: accent, marginLeft: 9 }} />
            <div style={{ width: 34, height: 9, borderRadius: 2, background: accent, marginLeft: 18 }} />
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 600, letterSpacing: -1.5 }}>
            cascadehook<span style={{ color: accent }}>.</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 96, lineHeight: 1.05, letterSpacing: -4 }}>Webhooks,</div>
          <div style={{ display: "flex", fontSize: 96, lineHeight: 1.05, letterSpacing: -4, color: accent }}>taken care of.</div>
          <div style={{ display: "flex", marginTop: 32, fontSize: 30, color: muted }}>
            Signed requests, automatic retries, and a record of every attempt.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 28, borderTop: `1px solid ${border}`, fontSize: 24, color: muted }}>
          <span>Outbound webhook delivery</span>
          <span>cascadehook.com</span>
        </div>
      </div>
    ),
    size,
  );
}
