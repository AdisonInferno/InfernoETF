"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import TickerTape from "@/components/TickerTape";
import { ETFS, fmtPct } from "@/lib/etfs";

const NAV = [
  { href: "/scanner", label: "SCANNER" },
  { href: "/portfolio", label: "PORTFOLIO" },
  { href: "/watchlist", label: "WATCHLIST" },
  { href: "/news", label: "NEWS" },
  { href: "/etf-tools", label: "ETF TOOLS" },
];


function SearchBox() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // "/" focuses the search, Escape leaves it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return ETFS.filter((e) => e.ticker.toLowerCase().startsWith(s) || e.name.toLowerCase().includes(s)).slice(0, 7);
  }, [q]);

  const go = (ticker: string) => {
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
    router.push(`/etf/${encodeURIComponent(ticker)}`);
  };

  return (
    <div className="relative w-full max-w-[620px]">
      <div className="flex h-10 items-center gap-2.5 rounded-sm border border-white/[0.06] bg-white/[0.03] px-3.5 transition-colors focus-within:border-white/[0.14] focus-within:bg-white/[0.05]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="flex-none text-zinc-500">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && results[active]) go(results[active].ticker);
            if (e.key === "Escape") inputRef.current?.blur();
          }}
          placeholder="Search ETF..."
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <kbd className="rounded-sm border border-white/[0.08] bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">/</kbd>
      </div>

      {open && results.length > 0 && (
        <div className="absolute inset-x-0 top-12 z-[60] overflow-hidden rounded-sm border border-white/[0.08] bg-[var(--oasis-panel)] p-1">
          {results.map((r, i) => (
            <button
              key={r.ticker}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(r.ticker)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left ${i === active ? "bg-white/[0.07]" : ""}`}
            >
              <span className="w-14 font-mono text-[13px] font-bold text-zinc-50">{r.ticker}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{r.name}</span>
              <span className={`font-mono text-xs font-semibold ${r.chg1d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(r.chg1d)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** University building — pediment, four columns, steps (glossary / learning) */
function GlossaryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 8.6 12 3.2l9.5 5.4" />
      <path d="M3.5 9.6h17" />
      <circle cx="12" cy="6.7" r="0.9" fill="currentColor" stroke="none" />
      <path d="M5.5 11.2v6.4M9.8 11.2v6.4M14.2 11.2v6.4M18.5 11.2v6.4" />
      <path d="M3.5 18.6h17M2.5 20.8h19" />
    </svg>
  );
}

/** Small label under a header icon — appears only on hover / keyboard focus */
function HoverLabel({ text }: { text: string }) {
  return (
    <span role="tooltip" className="pointer-events-none absolute right-1/2 top-[calc(100%+8px)] z-[70] translate-x-1/2 whitespace-nowrap rounded-xs border border-white/[0.08] bg-[var(--oasis-panel)] px-2 py-1 text-[11px] font-medium tracking-[0.04em] text-zinc-200 opacity-0 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.5)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
      {text}
    </span>
  );
}

function IconButton({ label, hint, children, onClick }: { label: string; hint: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="group relative flex h-9 w-9 items-center justify-center rounded-sm border border-white/[0.06] bg-white/[0.03] transition-colors hover:bg-white/[0.08]"
    >
      {children}
      <HoverLabel text={hint} />
    </button>
  );
}

/** Calm, elegant logotype: Cormorant Garamond caps, airy spacing + a quiet Manrope sub-label */
function OasisLogo() {
  return (
    <span className="flex items-baseline gap-3 leading-none">
      <span className="font-['Cormorant_Garamond_Variable',serif] text-[34px] font-medium uppercase tracking-[0.32em] text-white">OASIS</span>
      <span className="font-sans text-[10.5px] font-normal uppercase tracking-[0.38em] text-zinc-500">Terminal</span>
    </span>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="z-50 w-full flex-none bg-[var(--oasis-bg)]">
      {/* Row 1: logo · search · actions */}
      <div className="grid h-[68px] grid-cols-[1fr_minmax(0,620px)_1fr] items-center gap-6 px-3">
        <Link href="/scanner" className="flex items-center gap-3 justify-self-start">
          <OasisLogo />
        </Link>

        <SearchBox />

        <div className="flex items-center gap-2 justify-self-end">
          <Link
            href="/glossary"
            aria-label="Glossary"
            className={`group relative flex h-9 w-9 items-center justify-center rounded-sm border transition-colors ${
              pathname?.startsWith("/glossary") ? "oasis-on" : "border-white/[0.06] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <GlossaryIcon />
            <HoverLabel text="Glossary" />
          </Link>
          <IconButton label="Settings · accent colour" hint="Settings" onClick={() => window.dispatchEvent(new Event("oasis:accent-toggle"))}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-200">
              <path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" transform="translate(-1 0)" />
            </svg>
          </IconButton>
          <IconButton label="Profile" hint="Profile">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-400">
              <circle cx="12" cy="8" r="4.2" />
              <path d="M3.5 21c0-4.4 3.8-7.5 8.5-7.5s8.5 3.1 8.5 7.5Z" />
            </svg>
          </IconButton>
        </div>
      </div>

      {/* Row 2: main menu */}
      <nav className="flex h-10 items-center justify-center gap-2 overflow-x-auto px-3 pb-1">
        {NAV.map((n) => {
          const active = pathname === n.href || pathname?.startsWith(n.href + "/") || (n.href === "/scanner" && pathname?.startsWith("/etf/"));
          return (
            <Link
              key={n.href}
              href={n.href}
              // Same page again → tell it to reset to its first view (e.g. portfolio deep view → overview)
              onClick={() => { if (pathname === n.href) window.dispatchEvent(new CustomEvent("inferno:nav-same", { detail: n.href })); }}
              className={`whitespace-nowrap rounded-sm border px-3.5 py-1.5 text-[12px] font-semibold tracking-[0.08em] transition-colors ${
                active
                  ? "oasis-on"
                  : "border-transparent text-zinc-400 hover:text-white"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>

      {/* Row 3: ticker */}
      <TickerTape />
    </header>
  );
}
