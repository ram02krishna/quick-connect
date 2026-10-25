import type { Metadata, Viewport } from "next";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/bricolage-grotesque";
import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import { ToasterThemed } from "../components/ToasterThemed";
import { Analytics } from "@vercel/analytics/react";

export const metadata: Metadata = {
  title: { default: "QuickConnect", template: "%s · QuickConnect" },
  description: "Chat, voice and video calls in one place. Direct messages, groups, voice notes and file sharing.",
  manifest: "/manifest.json",
};

// Pinch-zoom stays enabled — disabling it is an accessibility failure.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8ecf0" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1014" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <ToasterThemed />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
