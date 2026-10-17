"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMyPortfolio } from "@/lib/my-portfolio";
import { lookThrough } from "@/lib/portfolio";
import { ETFS, fmtPct, type EtfRow } from "@/lib/etfs";

/* ─────────────────────────────────────────────────────────────
   MARKET PULSE — right rail of the scanner
   · MOST ACTIVE: top 5 by today's $ volume across every ETF in the database.
     Bar length = volume, bar colour = today's move.
   · TOP MOVERS: 3 best / 3 worst 1D moves in the current scanner view
   · MARKET-MOVING NEWS: one line per headline; tickers coloured by impact on that company
     (AI read if already analysed, else a quick lexicon tone). Hover = AI summary — computed once
     per article and stored on disk, so the quota is never spent twice.
   Volume is a MODEL ESTIMATE (no volume feed yet).
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

type Dir = "up" | "down" | "neutral";
interface Insight { summary: string; impacts: { ticker: string; direction: Dir; why: string }[] }
interface News { id: string; ts: number; headline: string; url: string; source: string; tickers: string[]; tone: number; impact?: 1 | 2 | 3; impactPts?: number; insight: Insight | null }

const ago = (ts: number) => {
  const m = Math.max(1, Math.round((Date.now() / 1000 - ts) / 60));
  return m < 60 ? `${m}M` : m < 1440 ? `${Math.round(m / 60)}H` : `${Math.round(m / 1440)}D`;
};
const toneDir = (t: number): Dir => (t > 0.15 ? "up" : t < -0.15 ? "down" : "neutral");
const DIR_CLS: Record<Dir, string> = {
  up: "bg-emerald-500/15 text-emerald-300",
  down: "bg-rose-500/15 text-rose-300",
  neutral: "bg-amber-400/15 text-amber-300",
};

const H = ({ t, sub }: { t: string; sub?: string }) => (
  <div className="flex items-baseline justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
    <span className="font-mono text-[11.5px] font-bold tracking-[0.14em] text-zinc-200">[ {t} ]</span>
    {sub && <span className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.14em] text-emerald-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />{sub}</span>}
  </div>
);

const Pct = ({ v }: { v: number }) => (
  <span className={`w-[70px] text-right font-bold ${v >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{v > 0 ? "▲" : v < 0 ? "▼" : "■"} {fmtPct(v)}</span>
);

/** 1-3 rising bars = how market-moving the headline is */
function Impact({ n, pts }: { n: number; pts?: number }) {
  const cls = n === 3 ? "bg-rose-400" : n === 2 ? "bg-amber-300" : "bg-zinc-400";
  return (
    <span className="flex h-[11px] flex-none items-end gap-[2px]" title={`Impact ${n}/3${pts != null ? ` · score ${pts}` : ""} — event words, tone, mega-caps, coverage, source`}>
      {[5, 8, 11].map((h, i) => <span key={h} className={`w-[3px] rounded-[1px] ${i < n ? cls : "bg-white/10"}`} style={{ height: h }} />)}
    </span>
  );
}

type NRange = "d" | "w" | "m";
const NRANGES: [NRange, string][] = [["d", "DAILY"], ["w", "WEEKLY"], ["m", "MONTHLY"]];

function NewsRow({ n, onInsight, mine }: { n: News; onInsight: (id: string, i: Insight) => void; /** look-through weight of each ticker in MY portfolio */ mine: Record<string, number> }) {
  /** Popover anchor (viewport coords) — fixed so the scrolling rail can't clip it */
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [state, setState] = useState<{ loading: boolean; error?: string }>({ loading: false });

  const load = (e: React.SyntheticEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover({ x: r.left, y: Math.min(r.top, window.innerHeight - 220) });
    if (n.insight || state.loading || state.error) return;
    setState({ loading: true });
    fetch(`/api/pulse/insight?id=${encodeURIComponent(n.id)}`)
      .then((r) => r.json())
      .then((j) => { if (j.error) setState({ loading: false, error: j.error }); else { onInsight(n.id, j); setState({ loading: false }); } })
      .catch(() => setState({ loading: false, error: "AI unavailable" }));
  };

  const dirOf = (t: string): Dir => n.insight?.impacts.find((x) => x.ticker === t)?.direction ?? toneDir(n.tone);
  const tickers = n.tickers.length ? n.tickers : n.insight?.impacts.map((x) => x.ticker) ?? [];
  const inPf = tickers.filter((t) => (mine[t] ?? 0) > 0);

  return (
    <div className="relative" onMouseEnter={load} onMouseLeave={() => setHover(null)} onFocus={load} onBlur={() => setHover(null)}>
      <a href={n.url} target="_blank" rel="noreferrer" className="flex flex-col gap-1 border-b border-white/[0.04] px-3 py-2 hover:bg-white/[0.03]">
        <span className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.06em]">
          <Impact n={n.impact ?? 1} pts={n.impactPts} />
          <span className="text-zinc-400">{ago(n.ts)}</span>
          <span className="truncate text-zinc-600">{n.source.toUpperCase()}</span>
          {inPf.length > 0 && (
            <span className="flex-none rounded-sm bg-oasis-muted px-1.5 py-px text-[9.5px] font-bold tracking-[0.08em] text-oasis" title={`In your portfolio: ${inPf.map((t) => `${t} ${mine[t].toFixed(1)}%`).join(", ")}`}>★ PORTFOLIO</span>
          )}
          <span className="ml-auto flex flex-none gap-1">
            {tickers.slice(0, 3).map((t) => (
              <span key={t} className={`rounded-sm px-1.5 py-px text-[11.5px] font-bold ${DIR_CLS[dirOf(t)]}`}>{t}</span>
            ))}
          </span>
        </span>
        <span className="truncate text-[13px] leading-snug text-zinc-200" title={n.headline}>{n.headline}</span>
      </a>
      {hover && (
        <div className="pointer-events-none fixed z-[100] w-[340px] rounded-sm border border-white/[0.1] bg-[var(--oasis-panel)] p-3 font-mono" style={{ left: Math.max(8, hover.x - 348), top: hover.y }}>
          <div className="mb-1.5 text-[9.5px] font-bold tracking-[0.14em] text-zinc-500">[ AI OVERSIGHT ]</div>
          {n.insight ? (
            <>
              <p className="m-0 font-sans text-[12.5px] leading-snug text-zinc-200">{n.insight.summary}</p>
              <div className="mt-2 flex flex-col gap-1">
                {n.insight.impacts.map((x) => (
                  <span key={x.ticker} className="flex items-baseline gap-2 text-[11px]">
                    <span className={`rounded-sm px-1.5 font-bold ${DIR_CLS[x.direction]}`}>{x.ticker}</span>
                    <span className="text-zinc-400">{x.why}</span>
                  </span>
                ))}
              </div>
              <div className="mt-2 text-[9px] tracking-[0.06em] text-zinc-600">LLM READ OF HEADLINE · CACHED · VERIFY BEFORE TRADING</div>
            </>
          ) : state.error ? (
            <p className="m-0 text-[11px] text-amber-400">⚠ {state.error}</p>
          ) : (
            <div className="flex flex-col gap-1.5"><div className="h-3 animate-pulse rounded bg-white/[0.06]" /><div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" /></div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MarketPulse({ rows, all = ETFS }: { rows: EtfRow[]; /** every ETF (with live numbers) for MOST ACTIVE */ all?: EtfRow[] }) {
  const active = [...all].map((e) => ({ e, v: estDollarVolM(e) })).sort((a, b) => b.v - a.v).slice(0, 5);
  const maxV = active[0]?.v ?? 1;
  const byMove = [...rows].sort((a, b) => b.chg1d - a.chg1d);
  const up = byMove.slice(0, 3).filter((e) => e.chg1d > 0);
  const down = byMove.slice(-3).reverse().filter((e) => e.chg1d < 0);

  const [news, setNews] = useState<News[] | null>(null);
  const [nr, setNr] = useState<NRange>("d");
  /* my portfolio, look-through (ETFs opened up) → which news touch what I own */
  const myPos = useMyPortfolio();
  const mineW = useMemo(() => lookThrough(myPos), [myPos]);
  useEffect(() => {
    let off = false;
    fetch(`/api/pulse/news?limit=25&range=${nr}`)
      .then((r) => (r.ok ? r.json() : { news: [] }))
      .then((j: { news?: News[] }) => { if (!off) setNews(j.news ?? []); })
      .catch(() => { if (!off) setNews([]); });
    return () => { off = true; };
  }, [nr]);
  const setInsight = (id: string, i: Insight) => setNews((l) => l?.map((n) => (n.id === id ? { ...n, insight: i } : n)) ?? l);

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden oasis-glass border border-white/[0.06] bg-[var(--oasis-panel)]">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Most active — bar length = $ volume, colour = today's move */}
        <H t="MOST ACTIVE" />
        <div className="flex flex-col gap-1 px-3 py-2">
          {active.map(({ e, v }, i) => {
            const pos = e.chg1d >= 0;
            return (
              <Link key={e.ticker} href={`/etf/${e.ticker}`} className="grid grid-cols-[12px_48px_minmax(0,1fr)_70px] items-center gap-2 font-mono text-[12px] tabular-nums transition-colors duration-75 hover:bg-white/[0.03]">
                <span className="text-[10px] text-zinc-600">{i + 1}</span>
                <span className="font-bold text-zinc-100">{e.ticker}</span>
                <span className="relative h-[20px] min-w-0">
                  <span className={`absolute inset-y-0 left-0 rounded-sm ${pos ? "bg-emerald-500/25" : "bg-rose-500/25"}`} style={{ width: `${Math.max(42, (v / maxV) * 100)}%` }} />
                  <span className={`absolute inset-y-0 left-0 w-[2px] ${pos ? "bg-emerald-400" : "bg-rose-400"}`} />
                  <span className="relative flex h-full items-center whitespace-nowrap pl-2 text-[10.5px] text-zinc-200">
                    <span className="mr-1.5 text-[9px] tracking-[0.12em] text-zinc-400">VOL</span>{fmtVol(v)}
                  </span>
                </span>
                <Pct v={e.chg1d} />
              </Link>
            );
          })}
        </div>

        {/* Top movers in the current view */}
        <H t="TOP MOVERS" />
        <div className="py-1">
          {[...up, ...down].map((e, i) => (
            <Link key={e.ticker} href={`/etf/${e.ticker}`}
              className={`grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-[5px] font-mono text-[12px] tabular-nums transition-colors duration-75 hover:bg-white/[0.03] ${i === up.length && up.length ? "border-t border-white/[0.05]" : ""}`}>
              <span className="font-bold text-zinc-100">{e.ticker}</span>
              <span className="truncate font-sans text-[11.5px] text-zinc-500">{e.name}</span>
              <Pct v={e.chg1d} />
            </Link>
          ))}
          {!up.length && !down.length && <p className="m-0 px-3 py-2 font-mono text-[11px] text-zinc-600">No moves in this view.</p>}
        </div>

        {/* News */}
        <H t="MARKET-MOVING NEWS" sub="LIVE" />
        <div className="grid grid-cols-3 gap-1.5 px-3 py-2">
          {NRANGES.map(([k, l]) => (
            <button key={k} type="button" onClick={() => { if (k !== nr) { setNews(null); setNr(k); } }}
              className={`h-6 rounded-full border font-mono text-[9.5px] font-bold tracking-[0.12em] transition-colors ${nr === k ? "oasis-on" : "border-white/[0.08] text-zinc-500 hover:text-zinc-200"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-col">
          {news === null && Array.from({ length: 5 }, (_, i) => <div key={i} className="mx-3 my-1.5 h-9 animate-pulse rounded-sm bg-white/[0.03]" />)}
          {news?.map((n) => <NewsRow key={n.id} n={n} onInsight={setInsight} mine={mineW} />)}
          {news?.length === 0 && (
            <p className="m-0 px-3 py-3 font-mono text-[11px] leading-relaxed text-zinc-600">
              No headlines yet — the news collector fills this once it runs (needs FINNHUB_API_KEY).
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
