import type { Metadata } from "next";
import localFont from "next/font/local";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./globals.css";

const sans = localFont({
  src: "./fonts/ibm-plex-sans-latin.woff2",
  variable: "--font-plex-sans",
  weight: "100 700",
  display: "swap",
});
const mono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-mono-latin-500.woff2", weight: "500" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Cascadehook Docs", template: "%s · Cascadehook Docs" },
  description: "Build reliable webhook integrations with Cascadehook. Guides, receiver examples, and the project API reference.",
  applicationName: "Cascadehook Docs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        {/* Native highlight selectors are valid CSS but unsupported by the build's CSS optimizer. */}
        <style>{"::highlight(fd-search) { color: var(--color-fd-primary); text-decoration: underline; }"}</style>
      </head>
      <body className="flex min-h-screen flex-col">
        <a href="#nd-page" className="docs-skip-link">Skip to content</a>
        <RootProvider theme={{ defaultTheme: "system", storageKey: "cascadehook-docs-theme" }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
