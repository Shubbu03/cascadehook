import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import { themeScript } from "@/lib/theme";
import "./globals.css";
import "./theme-transition.css";

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
  title: {
    default: "Cascadehook — Webhooks, delivered.",
    template: "%s · Cascadehook",
  },
  description:
    "Reliable outbound webhooks for your application. Publish events, deliver signed requests, and understand every attempt.",
  applicationName: "Cascadehook",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={sans.variable + " " + mono.variable}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="fixed top-3 left-3 z-100 bg-surface transform-[translateY(-160%)] rounded-lg py-2.5 px-4 border border-solid border-accent focus:transform-[translateY(0)]" href="#main-content">
          Skip to content
        </a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
