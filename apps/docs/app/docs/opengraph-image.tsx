import { ImageResponse } from "next/og";

// Lives under app/docs so its URL stays inside the /docs routes this Worker owns.
// Rendered once at build time and shared by every documentation page.
export const alt = "Cascadehook Docs — guides, receiver examples, and the API reference";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Dark theme tokens from the web app. The image renderer cannot read CSS variables.
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
            <span style={{ marginLeft: 14, color: muted, fontWeight: 400 }}>docs</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 88, lineHeight: 1.05, letterSpacing: -3.5 }}>Build reliable</div>
          <div style={{ display: "flex", fontSize: 88, lineHeight: 1.05, letterSpacing: -3.5, color: accent }}>webhook integrations.</div>
          <div style={{ display: "flex", marginTop: 32, fontSize: 30, color: muted }}>
            Quickstart, signatures, receiver examples, and the API reference.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 28, borderTop: `1px solid ${border}`, fontSize: 24, color: muted }}>
          <span>Developer documentation</span>
          <span>cascadehook.com/docs</span>
        </div>
      </div>
    ),
    size,
  );
}
