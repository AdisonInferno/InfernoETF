"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import TickerTape from "@/components/TickerTape";
import { ETFS, fmtPct } from "@/lib/etfs";

const NAV = [
  { href: "/scanner", label: "SCANNER" },
  { href: "/portfolio", label: "PORTFOLIO" },
  { href: "/tools", label: "ETF TOOLS" },
  { href: "/news", label: "NEWS" },
  { href: "/academy", label: "ACADEMY" },
];

/* Swap for your own logo: put logo.svg in /public and use <img src="/logo.svg" />. */
function LogoMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" className="flex-none drop-shadow-[0_0_10px_rgba(239,68,68,0.45)]">
      <defs>
        <linearGradient id="inferno-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#b91c1c" />
          <stop offset="1" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      <path
        fill="url(#inferno-flame)"
        d="M16 2c1.2 4.2-1 6.6-3 8.8-2.1 2.3-4.6 4.6-4.6 8.9C8.4 25.4 12 30 16.6 30c5 0 8.4-3.9 8.4-9.1 0-3.9-2-6.6-3.7-8.4.2 2.2-.5 4.2-2.2 5.1.5-4.6-.9-9.8-3.1-15.6Z"
      />
      <path fill="#0a0a0c" d="M15.6 18.5c-2 1.7-3 3.4-3 5.3 0 2.2 1.6 3.9 3.8 3.9s3.8-1.7 3.8-4c0-1.5-.7-2.7-1.6-3.6-.1 1.2-.7 2-1.6 2.3.4-1.3.1-2.6-1.4-3.9Z" />
    </svg>
  );
}

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
      <div className="flex h-10 items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 transition-colors focus-within:border-white/[0.14] focus-within:bg-white/[0.05]">
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
        <kbd className="rounded-md border border-white/[0.08] bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">/</kbd>
      </div>

      {open && results.length > 0 && (
        <div className="absolute inset-x-0 top-12 z-[60] overflow-hidden rounded-xl border border-white/[0.08] bg-[#121214] p-1 shadow-[0_25px_50px_-12px_#000]">
          {results.map((r, i) => (
            <button
              key={r.ticker}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(r.ticker)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === active ? "bg-white/[0.07]" : ""}`}
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

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] transition-colors hover:bg-white/[0.08]"
    >
      {children}
    </button>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="z-50 w-full flex-none bg-[#060607]">
      {/* Row 1: logo · search · actions */}
      <div className="grid h-[68px] grid-cols-[1fr_minmax(0,620px)_1fr] items-center gap-6 px-6">
        <Link href="/scanner" className="flex items-center gap-3 justify-self-start">
          <LogoMark />
          <span className="text-[17px] font-bold tracking-[0.28em] text-white">INFERNO</span>
          <span className="rounded-[3px] border border-red-500/70 px-1.5 py-[1px] font-mono text-[12px] font-bold tracking-[0.14em] text-red-500">
            ETF
          </span>
        </Link>

        <SearchBox />

        <div className="flex items-center gap-2 justify-self-end">
          <IconButton label="Settings">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#e4e4e7">
              <path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" transform="translate(-1 0)" />
            </svg>
          </IconButton>
          <IconButton label="Account">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#7c3aed">
              <circle cx="12" cy="8" r="4.2" />
              <path d="M3.5 21c0-4.4 3.8-7.5 8.5-7.5s8.5 3.1 8.5 7.5Z" />
            </svg>
          </IconButton>
        </div>
      </div>

      {/* Row 2: main menu */}
      <nav className="flex h-10 items-center justify-center gap-2 overflow-x-auto px-6 pb-1">
        {NAV.map((n) => {
          const active = pathname === n.href || pathname?.startsWith(n.href + "/") || (n.href === "/scanner" && pathname?.startsWith("/etf/"));
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-[12px] font-semibold tracking-[0.08em] transition-colors ${
                active
                  ? "border-red-500/40 bg-red-500/[0.12] text-red-400 shadow-[0_0_18px_rgba(239,68,68,0.18)]"
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
