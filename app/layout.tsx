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

const THEME_BOOT = `try{var b=localStorage.getItem("oasis.bg.v1");if(b&&/^#[0-9a-f]{6}$/i.test(b)){var d=document.documentElement,n=parseInt(b.slice(1),16);d.style.setProperty("--oasis-bg",b);if(0.2126*(n>>16&255)+0.7152*(n>>8&255)+0.0722*(n&255)>140)d.dataset.theme="light"}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <head>
        {/* Restore the saved background / theme before first paint (no dark→light flash) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
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
