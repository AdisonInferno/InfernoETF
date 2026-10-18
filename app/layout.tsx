import type { Metadata } from "next";
// OASIS type: Manrope (text + headings) · Geist Mono (numbers, labels, tables) — soft, calm, elegant
import "@fontsource-variable/manrope";
import "@fontsource-variable/geist-mono";
// Syncopate = wide display font of the OASIS logotype
import "@fontsource/syncopate/700.css";
import SiteHeader from "@/components/SiteHeader";
import TickerContextMenu from "@/components/TickerContextMenu";
import OasisColorScrubber from "@/components/OasisColorScrubber";
import "./globals.css";

export const metadata: Metadata = {
  title: "OASIS",
  description: "ETF scanner, portfolio and AI assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      {/* Fixed-height app shell: header stays put, only <main> scrolls. */}
      <body className="flex h-dvh flex-col overflow-hidden bg-[var(--oasis-bg)] font-sans text-white antialiased">
        <SiteHeader />
        <main className="relative flex min-h-0 w-full flex-1 flex-col overflow-y-auto">{children}</main>
        <TickerContextMenu />
        <OasisColorScrubber />
      </body>
    </html>
  );
}
