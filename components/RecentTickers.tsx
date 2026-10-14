"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ETFS, fmtPct } from "@/lib/etfs";
import { QUOTE } from "@/lib/fund-profiles";

/* Terminal history bar — the last 5 ETFs opened in Deep View (/etf/[ticker]), newest first.
   Stored per browser; until the user has history it shows a starter set. */

const KEY = "inferno.recent.v1";
const STARTER = ["QQQ", "SMH", "ITA", "TLT", "XLE"];
const MAX = 5;
const BY = new Map(ETFS.map((e) => [e.ticker, e]));

function read(): string[] {
  try { return (JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[]).filter((t) => BY.has(t)); } catch { return []; }
}

export default function RecentTickers() {
  const path = usePathname();
  const [list, setList] = useState<string[]>(STARTER);

  // Record Deep View visits; sync with storage (other tabs too).
  useEffect(() => {
    const m = path?.match(/^\/etf\/([^/?#]+)/);
    let cur = read();
    if (m) {
      const t = decodeURIComponent(m[1]).toUpperCase();
      if (BY.has(t)) {
        cur = [t, ...cur.filter((x) => x !== t)].slice(0, MAX);
        try { window.localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* ignore */ }
      }
    }
    const next = cur.length ? [...cur, ...STARTER.filter((t) => !cur.includes(t))].slice(0, MAX) : STARTER;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from browser storage after navigation
    setList(next);
  }, [path]);

  return (
    <footer className="z-50 flex h-8 w-full flex-none items-center gap-3 overflow-x-auto border-t border-white/[0.05] bg-[#0a0a0c] px-4 py-1.5 font-mono">
      <span className="flex-none text-[10px] tracking-[0.14em] text-zinc-500">[ RECENT TICKERS ]</span>
      <nav aria-label="Recently viewed" className="flex items-center gap-1">
        {list.map((t) => {
          const e = BY.get(t)!;
          const px = QUOTE[t]?.[0];
          const active = path?.toUpperCase() === `/ETF/${t}`;
          return (
            <Link key={t} href={`/etf/${t}`}
              className={`flex flex-none items-baseline gap-1.5 rounded-sm px-2 py-0.5 text-[11px] tabular-nums transition-colors hover:bg-white/[0.05] ${active ? "bg-white/[0.06]" : ""}`}>
              <span className="font-bold text-zinc-100">{t}</span>
              {px != null && <span className="text-zinc-400">${px.toFixed(2)}</span>}
              <span className={e.chg1d >= 0 ? "text-emerald-500" : "text-rose-500"}>{fmtPct(e.chg1d)}</span>
            </Link>
          );
        })}
      </nav>
    </footer>
  );
}
