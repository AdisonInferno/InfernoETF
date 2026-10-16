"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ETFS, fmtPct } from "@/lib/etfs";
import { useLiveEtfs } from "@/lib/market-snapshot";

/* Terminal history bar — the last 5 ETFs opened in Deep View (/etf/[ticker]), newest first.
   Stored per browser; until the user has history it shows a starter set. */

const KEY = "inferno.recent.v1";
const STARTER = ["QQQ", "SMH", "ITA", "TLT", "XLE"];
const MAX = 5;
const KNOWN = new Set(ETFS.map((e) => e.ticker));

function read(): string[] {
  try { return (JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[]).filter((t) => KNOWN.has(t)); } catch { return []; }
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
      if (KNOWN.has(t)) {
        cur = [t, ...cur.filter((x) => x !== t)].slice(0, MAX);
        try { window.localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* ignore */ }
      }
    }
    const next = cur.length ? [...cur, ...STARTER.filter((t) => !cur.includes(t))].slice(0, MAX) : STARTER;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from browser storage after navigation
    setList(next);
  }, [path]);

  const { etfs, price } = useLiveEtfs();
  const BY = new Map(etfs.map((e) => [e.ticker, e]));
  return (
    <nav aria-label="Recently viewed" className="grid w-full grid-cols-5 gap-2 font-mono">
        {list.map((t) => {
          const e = BY.get(t)!;
          const px = price[t];
          const active = path?.toUpperCase() === `/ETF/${t}`;
          return (
            <Link key={t} href={`/etf/${t}`}
              className={`flex min-w-0 cursor-pointer items-center justify-center gap-3 rounded-sm border px-4 py-2 text-[11px] tabular-nums transition-all duration-75 hover:border-white/[0.2] hover:bg-white/[0.08] active:translate-y-px active:bg-white/[0.12] ${active ? "border-white/[0.12] bg-white/[0.05]" : "border-transparent"}`}>
              <span className="font-bold text-zinc-100">{t}</span>
              {px != null && <span className="text-zinc-400">${px.toFixed(2)}</span>}
              <span className={e.chg1d >= 0 ? "text-emerald-500" : "text-rose-500"}>{fmtPct(e.chg1d)}</span>
            </Link>
          );
        })}
    </nav>
  );
}
