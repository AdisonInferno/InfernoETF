"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import InfernoChart from "@/components/InfernoChart";
import { toggleFavorite, useWatchlist } from "@/lib/watchlist";
import type { EtfRow } from "@/lib/etfs";
import type { FundData } from "@/components/deep-view/types";
import { QUOTE } from "@/lib/fund-profiles";

/* ─────────────────────────────────────────────────────────────
   ETF DEEP-DIVE COCKPIT — opens when a fund is clicked in the scanner.
   12-col grid of widgets:
   ┌ header: ticker · name · live price · day change · [ ☆ FAVORITE ] ───────────┐
   │ CHART — ETF vs overlays, zoom/pan (full width of the left column)            │
   Holdings, holding news, composition and analytics live in the FULL DEEP DIVE (prominent CTA).
   └──────────────────────────────────────────────────────────────────────────────┘
   Prices: /api/prices (history) and /api/quotes (live, incl. pre/post market) from Yahoo.
   If those can't be reached the chart falls back to labelled model data.
   ───────────────────────────────────────────────────────────── */

const MONO = "font-mono";

interface Quote { price: number; prevClose: number; chg: number; session: "PRE" | "REG" | "POST" | "CLOSED"; currency: string; exchange: string }

const sgn = (v: number, d = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}%`;
const tone = (v: number) => (v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-400");

function Widget({ title, right, className = "", children }: { title: string; right?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`flex min-h-0 min-w-0 flex-col oasis-glass border border-white/[0.05] bg-[var(--oasis-panel)] ${className}`}>
      <header className="flex flex-none items-center justify-between gap-2 border-b border-white/[0.05] px-3 py-1.5">
        <span className={`${MONO} text-[10.5px] font-bold tracking-[0.14em] text-zinc-300`}>[ {title} ]</span>
        {right}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

/* ── B · holdings + pre-market ─────────────────────────────── */
export default function EtfDeepDiveCockpit({ etf, fund }: { etf: EtfRow; fund: FundData }) {
  const [expanded, setExpanded] = useState(false);
  const watch = useWatchlist();
  const fav = watch.favorites.includes(etf.ticker);
  const [quotes, setQuotes] = useState<{ key: string; q: Record<string, Quote | null> } | null>(null);
  const qKey = etf.ticker;

  const toggleFav = () => toggleFavorite(etf.ticker);

  useEffect(() => {
    let off = false;
    const load = () => fetch(`/api/quotes?symbols=${qKey}`).then((r) => r.json()).then((j) => { if (!off) setQuotes({ key: qKey, q: j.quotes ?? {} }); }).catch(() => { if (!off) setQuotes({ key: qKey, q: {} }); });
    load();
    const id = window.setInterval(load, 60_000);
    return () => { off = true; window.clearInterval(id); };
  }, [qKey]);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const q = quotes?.key === qKey ? quotes.q : null;
  const self = q?.[etf.ticker] ?? null;
  const price = self?.price ?? QUOTE[etf.ticker]?.[0] ?? null;
  const chg = self?.chg ?? etf.chg1d;

  const chartControls = (
    <button type="button" onClick={() => setExpanded((e) => !e)}
      className={`${MONO} h-6 rounded-sm border border-white/[0.08] px-2 text-[10px] font-bold tracking-[0.1em] text-zinc-400 transition-all duration-75 hover:border-white/[0.2] hover:text-white`}>
      [ {expanded ? "COLLAPSE" : "EXPAND"} ]
    </button>
  );
  const chartPinned = [
    { id: "SPY", label: "S&P 500", sym: "SPY", color: "#a1a1aa", dashed: true },
    ...fund.holdings.slice(0, 5).map((h, i) => ({ id: `top:${h.tic}`, label: h.tic, sym: h.tic, color: ["#60a5fa", "#f59e0b", "#f472b6", "#22d3ee", "#a3e635"][i] })),
  ].filter((l) => l.sym !== etf.ticker);
  const chartPicker = fund.holdings.map((h) => ({ sym: h.tic, label: h.tic, sub: `${h.w.toFixed(2)}% · ${h.name}` }));

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* Global header */}
      <div className={`${MONO} flex flex-none flex-wrap items-baseline gap-x-4 gap-y-1`}>
        <span className="text-[20px] font-bold text-zinc-50">{etf.ticker}</span>
        <span className="truncate font-sans text-[12.5px] text-zinc-400">{etf.name}</span>
        <span className="text-[18px] font-semibold tabular-nums text-zinc-100">{price != null ? `$${price.toFixed(2)}` : "—"}</span>
        <span className={`text-[13px] font-bold tabular-nums ${tone(chg)}`}>{sgn(chg)}</span>
        {self && self.session !== "REG" && <span className="text-[9.5px] tracking-[0.12em] text-zinc-500">{self.session === "CLOSED" ? "AT CLOSE" : `${self.session}-MARKET`}</span>}
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={toggleFav} aria-pressed={fav}
            className={`h-7 rounded-sm border px-2.5 text-[10.5px] font-bold tracking-[0.1em] transition-all duration-75 ${fav ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-white/[0.08] text-zinc-400 hover:border-white/[0.2] hover:text-white"}`}>
            [ {fav ? "★ SAVED" : "☆ FAVORITE"} ]
          </button>
          {/* primary CTA — what the deep dive unlocks is spelled out under the label */}
          <Link href={`/etf/${etf.ticker}`} title="Holdings, composition map, sector breakdown, performance drivers & analytics"
            className="group flex h-9 items-center gap-2.5 rounded-[2px] border border-[#00E599] bg-[rgba(0,229,153,0.1)] px-3 text-white shadow-[0_0_14px_-4px_rgba(0,229,153,0.55)] transition-colors duration-100 hover:bg-[rgba(0,229,153,0.2)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00E599" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" />
            </svg>
            <span className="flex flex-col leading-none">
              <span className="text-[11px] font-bold tracking-[0.12em]">FULL DEEP DIVE <span className="text-[#00E599] transition-transform group-hover:translate-x-0.5">→</span></span>
              <span className="mt-0.5 text-[8.5px] tracking-[0.08em] text-[#8B949E]">HOLDINGS · SECTORS · DRIVERS</span>
            </span>
          </Link>
        </span>
      </div>

      {/* Widget grid */}
      <div className="flex min-h-0 flex-1 flex-col max-xl:min-h-[440px]">
        <Widget title={`${etf.ticker} · PERFORMANCE`} right={chartControls}
          className={expanded ? "fixed inset-3 z-[90] shadow-none" : "min-h-0 flex-1"}>
          <div className="h-full p-2"><InfernoChart key={etf.ticker} main={{ id: etf.ticker, label: etf.ticker, sym: etf.ticker, color: "#f87171" }} pinned={chartPinned} picker={chartPicker} /></div>
        </Widget>
      </div>
      {expanded && <div className="fixed inset-0 z-[89] bg-[var(--oasis-bg)]/90" onClick={() => setExpanded(false)} />}
    </div>
  );
}
