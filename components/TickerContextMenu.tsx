"use client";

/* Right-click on ANY ticker anywhere in the app (tables, maps, news chips, filings, legends, the
   correlation network …) → [ DEEP DIVE → ] (ETF or stock page) · [ ☆ ADD TO FAVORITES ].
   Works by reading the clicked element: an explicit data-ticker attribute, or the first known ticker
   in its text (ETF database, every ETF holding, your portfolio / watchlists). Anything else keeps the
   normal browser menu. */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ETFS } from "@/lib/etfs";
import { PROFILE_OF } from "@/lib/fund-profiles";
import { toggleFavorite, useWatchlist } from "@/lib/watchlist";

const ETF_SET = new Set(ETFS.map((e) => e.ticker));
const HOLDING_SET = (() => {
  const s = new Set<string>();
  for (const p of Object.values(PROFILE_OF)) for (const l of p.holdings) s.add(l.split("|")[0]);
  return s;
})();
const NOT_TICKERS = new Set(["ETF", "ETFS", "STOCK", "ALL", "USD", "EUR", "PLN", "AI", "CEO", "SEC", "FED", "GDP", "CPI", "EPS", "TER", "AUM", "YTD", "PE", "EST", "ACT", "NAV", "IPO", "US", "EU", "UK"]);

export default function TickerContextMenu() {
  const router = useRouter();
  const w = useWatchlist();
  const known = useMemo(() => new Set([...ETF_SET, ...HOLDING_SET, ...w.portfolio.map((p) => p.ticker), ...w.favorites, ...w.groups.flatMap((g) => g.tickers)]), [w]);
  const [menu, setMenu] = useState<{ x: number; y: number; t: string } | null>(null);

  useEffect(() => {
    const find = (el: HTMLElement | null): string | null => {
      for (let n = el, depth = 0; n && depth < 4; n = n.parentElement, depth++) {
        const d = n.dataset?.ticker;
        if (d) return d.toUpperCase();
        const text = (n.textContent ?? "").trim();
        if (!text || text.length > 60) break; // only short labels (a ticker chip, a cell, a tile) — not whole paragraphs
        for (const m of text.match(/\b[A-Z][A-Z0-9]{0,5}(?:\.[A-Z]{1,2})?\b/g) ?? []) {
          if (!NOT_TICKERS.has(m) && known.has(m)) return m;
        }
      }
      return null;
    };
    const onCtx = (e: MouseEvent) => {
      const t = find(e.target as HTMLElement);
      if (!t) { setMenu(null); return; }
      e.preventDefault();
      e.stopPropagation(); // capture phase: the ticker menu wins over component right-click actions (e.g. map compare)
      setMenu({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 110), t });
    };
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("contextmenu", onCtx, true);
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("contextmenu", onCtx, true);
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [known]);

  if (!menu) return null;
  const fav = w.favorites.includes(menu.t);
  const isEtf = ETF_SET.has(menu.t);
  const item = "flex w-full items-center justify-between gap-4 px-3 py-2 text-left text-[11px] font-bold tracking-[0.08em] transition-colors hover:bg-white/[0.07]";
  return (
    <div role="menu" className="fixed z-[200] w-[210px] overflow-hidden rounded-sm border border-white/[0.1] bg-[#0a0a0c] font-mono shadow-[0_8px_30px_rgba(0,0,0,0.6)]" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-baseline justify-between border-b border-white/[0.06] px-3 py-1.5">
        <span className="text-[12px] font-bold text-white">{menu.t}</span>
        <span className="text-[9.5px] tracking-[0.12em] text-zinc-500">{isEtf ? "ETF" : "STOCK"}</span>
      </div>
      <button type="button" role="menuitem" className={`${item} text-zinc-100`} onClick={() => { router.push(isEtf ? `/etf/${menu.t}` : `/stock/${menu.t}`); setMenu(null); }}>
        DEEP DIVE <span className="text-emerald-400">→</span>
      </button>
      <button type="button" role="menuitem" className={`${item} ${fav ? "text-amber-300" : "text-zinc-300"}`} onClick={() => { toggleFavorite(menu.t); setMenu(null); }}>
        {fav ? "★ REMOVE FAVORITE" : "☆ ADD TO FAVORITES"}
      </button>
    </div>
  );
}
