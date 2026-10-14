"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ETFS, fmtPct, type EtfRow } from "@/lib/etfs";

/* ─────────────────────────────────────────────────────────────
   MARKET PULSE — right rail of the scanner
   · MOST ACTIVE: top 5 by today's $ volume across every ETF in the database
   · TOP MOVERS: 3 best / 3 worst 1D moves in the current scanner view
   · MARKET-MOVING NEWS: latest high-quality headlines from the news archive
   Volume is a MODEL ESTIMATE (no volume feed yet): AUM × turnover, where turnover rises with
   volatility, leverage, trending rank and the size of today's move.
   ───────────────────────────────────────────────────────────── */

const VOL_TURN = { Low: 0.006, Medium: 0.011, High: 0.02 } as const;

/** Estimated dollar volume today, $M */
export function estDollarVolM(e: EtfRow): number {
  let t = VOL_TURN[e.volatility] * (e.leverage === "1x" ? 1 : 6);
  if (e.trending !== undefined) t *= 1.6 - Math.min(0.5, e.trending / 30);
  t *= 1 + Math.min(3, Math.abs(e.chg1d) / 1.5);
  return e.aum * 1000 * t;
}
const fmtVol = (m: number) => (m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${m.toFixed(0)}M`);

interface News { id: string; ts: number; headline: string; url: string; source: string; relevant?: string[] }

const ago = (ts: number) => {
  const m = Math.max(1, Math.round((Date.now() / 1000 - ts) / 60));
  return m < 60 ? `${m}M` : m < 1440 ? `${Math.round(m / 60)}H` : `${Math.round(m / 1440)}D`;
};

const H = ({ t, sub }: { t: string; sub?: string }) => (
  <div className="flex items-baseline justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
    <span className="font-mono text-[10.5px] font-bold tracking-[0.14em] text-zinc-200">[ {t} ]</span>
    {sub && <span className="font-mono text-[9px] tracking-[0.12em] text-zinc-600">{sub}</span>}
  </div>
);

function Row({ e, right, rank }: { e: EtfRow; right: React.ReactNode; rank?: number }) {
  return (
    <Link href={`/etf/${e.ticker}`} className="grid grid-cols-[14px_52px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-[5px] font-mono text-[11px] tabular-nums transition-colors hover:bg-white/[0.03]">
      <span className="text-[9.5px] text-zinc-600">{rank ?? ""}</span>
      <span className="font-bold text-zinc-100">{e.ticker}</span>
      <span className="truncate font-sans text-[10.5px] text-zinc-500">{e.name}</span>
      {right}
    </Link>
  );
}

const Pct = ({ v }: { v: number }) => (
  <span className={`w-[62px] text-right font-bold ${v >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{v > 0 ? "▲" : v < 0 ? "▼" : "■"} {fmtPct(v)}</span>
);

export default function MarketPulse({ rows, viewLabel }: { rows: EtfRow[]; viewLabel: string }) {
  const active = [...ETFS].map((e) => ({ e, v: estDollarVolM(e) })).sort((a, b) => b.v - a.v).slice(0, 5);
  const maxV = active[0]?.v ?? 1;
  const byMove = [...rows].sort((a, b) => b.chg1d - a.chg1d);
  const up = byMove.slice(0, 3).filter((e) => e.chg1d > 0);
  const down = byMove.slice(-3).reverse().filter((e) => e.chg1d < 0);

  const [news, setNews] = useState<News[] | null>(null);
  useEffect(() => {
    let off = false;
    const load = (days: number) =>
      fetch(`/api/news-archive?days=${days}&limit=10`)
        .then((r) => (r.ok ? r.json() : { articles: [] }))
        .then((j: { articles?: News[] }) => j.articles ?? []);
    load(1)
      .then((a) => (a.length >= 4 ? a : load(7)))
      .then((a) => { if (!off) setNews(a.slice(0, 10)); })
      .catch(() => { if (!off) setNews([]); });
    return () => { off = true; };
  }, []);

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-sm border border-white/[0.06] bg-[#0a0a0c]">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Most active */}
        <H t="MOST ACTIVE" sub="$ VOLUME · TODAY · EST." />
        <div className="py-1">
          {active.map(({ e, v }, i) => (
            <div key={e.ticker} className="relative">
              <span className="pointer-events-none absolute inset-y-[3px] left-0 bg-white/[0.035]" style={{ width: `${(v / maxV) * 100}%` }} />
              <Row e={e} rank={i + 1} right={
                <span className="flex items-center gap-2">
                  <span className="w-[54px] text-right text-zinc-200">{fmtVol(v)}</span>
                  <span className={`w-[52px] text-right text-[10.5px] ${e.chg1d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(e.chg1d)}</span>
                </span>
              } />
            </div>
          ))}
        </div>

        {/* Top movers in the current view */}
        <H t="TOP MOVERS · 1D" sub={viewLabel} />
        <div className="py-1">
          {up.map((e) => <Row key={e.ticker} e={e} right={<Pct v={e.chg1d} />} />)}
          {up.length > 0 && down.length > 0 && <div className="mx-3 my-1 h-px bg-white/[0.05]" />}
          {down.map((e) => <Row key={e.ticker} e={e} right={<Pct v={e.chg1d} />} />)}
          {!up.length && !down.length && <p className="m-0 px-3 py-2 font-mono text-[10.5px] text-zinc-600">No moves in this view.</p>}
        </div>

        {/* News */}
        <H t="MARKET-MOVING NEWS" sub={news ? `${news.length} · LIVE` : "…"} />
        <div className="flex flex-col py-1">
          {news === null &&
            Array.from({ length: 5 }, (_, i) => <div key={i} className="mx-3 my-1.5 h-7 animate-pulse rounded-sm bg-white/[0.03]" />)}
          {news?.map((n) => (
            <a key={n.id} href={n.url} target="_blank" rel="noreferrer" className="group flex flex-col gap-0.5 border-b border-white/[0.03] px-3 py-1.5 last:border-b-0 hover:bg-white/[0.03]">
              <span className="flex items-center gap-2 font-mono text-[9px] tracking-[0.1em] text-zinc-600">
                <span className="text-zinc-500">{ago(n.ts)}</span>
                <span className="truncate">{n.source.toUpperCase()}</span>
                {n.relevant?.slice(0, 2).map((t) => <span key={t} className="text-zinc-400">{t}</span>)}
              </span>
              <span className="line-clamp-2 text-[11.5px] leading-snug text-zinc-300 group-hover:text-white">{n.headline}</span>
            </a>
          ))}
          {news?.length === 0 && (
            <p className="m-0 px-3 py-3 font-mono text-[10.5px] leading-relaxed text-zinc-600">
              No headlines yet — the news collector fills this once it runs (needs FINNHUB_API_KEY).
            </p>
          )}
        </div>
      </div>
      <div className="flex-none border-t border-white/[0.06] px-3 py-1.5 font-mono text-[9px] tracking-[0.06em] text-zinc-600">
        VOLUME = MODEL ESTIMATE · NO LIVE VOLUME FEED YET
      </div>
    </aside>
  );
}
