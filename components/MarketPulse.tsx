"use client";

import { useHoldingReturns } from "@/components/deep-view/useHoldingReturns";
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

/** Estimated dollar volume, $M — today by default, or summed over a window (`days` sessions, `move` = window return %).
 *  Turnover rises with the size of the move (scaled by √days so a 1-month move isn't treated like a 1-day shock). */
export function estDollarVolM(e: EtfRow, days = 1, move = e.chg1d): number {
  let t = VOL_TURN[e.volatility] * (e.leverage === "1x" ? 1 : 6);
  if (e.trending !== undefined) t *= 1.6 - Math.min(0.5, e.trending / 30);
  t *= 1 + Math.min(3, Math.abs(move) / (1.5 * Math.sqrt(days)));
  return e.aum * 1000 * t * days;
}

/* one timeframe for MOST ACTIVE + TOP MOVERS */
type Tf = "1D" | "1W" | "1M";
const TFS: Tf[] = ["1D", "1W", "1M"];

type Dir = "up" | "down" | "neutral";
interface Insight {
  summary: string; impacts: { ticker: string; direction: Dir; why: string }[];
  whyItMatters?: string; keyPoints?: string[]; etfs?: { ticker: string; direction: Dir }[]; sectors?: string[];
  horizon?: string; confidence?: string; fullText?: boolean;
}
interface News { id: string; ts: number; headline: string; url: string; source: string; tickers: string[]; tone: number; impact?: 1 | 2 | 3; impactPts?: number; category?: string; impactScore?: number; vol?: "HIGH" | "MEDIUM" | "LOW"; sample?: boolean; insight: Insight | null }

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
const NRANGES: [NRange, string][] = [["d", "DAILY · 24H"], ["w", "WEEKLY · 1–7D"], ["m", "MONTHLY · 7–30D"]];

/** HIGH / MED / LOW expected volatility — green when the read is bullish, red when bearish, grey when neutral */
function VolBadge({ vol, score }: { vol: "HIGH" | "MEDIUM" | "LOW"; score: number }) {
  const c = score > 0.1 ? "border-emerald-400/40 text-emerald-300" : score < -0.1 ? "border-rose-400/40 text-rose-300" : "border-white/[0.12] text-zinc-400";
  return <span className={`flex-none rounded-sm border px-1 text-[9px] font-bold tracking-[0.08em] ${c}`} title={`Impact score ${score >= 0 ? "+" : ""}${score.toFixed(2)} (−1 bearish … +1 bullish)`}>{vol === "MEDIUM" ? "MED" : vol}</span>;
}

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
      <a href={n.url || undefined} target="_blank" rel="noreferrer" className="flex flex-col gap-1 border-b border-white/[0.04] px-3 py-2 hover:bg-white/[0.03]">
        <span className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.06em]">
          <Impact n={n.impact ?? 1} pts={n.impactPts} />
          {n.vol && <VolBadge vol={n.vol} score={n.impactScore ?? 0} />}
          <span className="text-zinc-400" title={new Date(n.ts * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC"}>{ago(n.ts)}</span>
          {n.category && <span className="flex-none text-[9px] tracking-[0.1em] text-zinc-500">{n.category}</span>}
          <span className="truncate text-zinc-600">{n.source.toUpperCase()}</span>
          {inPf.length > 0 && (
            <span className="flex-none rounded-sm bg-oasis-muted px-1.5 py-px text-[9.5px] font-bold tracking-[0.08em] text-oasis" title={`In your portfolio: ${inPf.map((t) => `${t} ${mine[t].toFixed(1)}%`).join(", ")}`}>★ PORTFOLIO</span>
          )}
          <span className="ml-auto flex flex-none gap-1">
            {tickers.slice(0, 3).map((t) => (
              <span key={t} className={`rounded-sm px-1.5 py-px text-[11.5px] font-bold ${DIR_CLS[dirOf(t)]}`}>[{t}]</span>
            ))}
          </span>
        </span>
        <span className="truncate text-[13px] leading-snug text-zinc-200" title={n.headline}>{n.headline}</span>
      </a>
      {hover && (
        <div className="pointer-events-none fixed z-[100] w-[400px] rounded-sm border border-white/[0.1] bg-[var(--oasis-panel)] p-3 font-mono" style={{ left: Math.max(8, hover.x - 408), top: Math.max(8, Math.min(hover.y, window.innerHeight - 380)) }}>
          <div className="mb-1.5 text-[9.5px] font-bold tracking-[0.14em] text-zinc-500">[ AI OVERSIGHT ]</div>
          {n.insight ? (
            <>
              <p className="m-0 font-sans text-[12.5px] leading-snug text-zinc-200">{n.insight.summary}</p>
              {n.insight.whyItMatters && <p className="m-0 mt-1.5 font-sans text-[11.5px] leading-snug text-zinc-400"><span className="font-mono text-[9px] tracking-[0.12em] text-oasis">WHY IT MATTERS · </span>{n.insight.whyItMatters}</p>}
              {!!n.insight.keyPoints?.length && (
                <ul className="m-0 mt-1.5 flex list-none flex-col gap-0.5 p-0">
                  {n.insight.keyPoints.map((k) => <li key={k} className="flex gap-1.5 font-sans text-[11px] leading-snug text-zinc-300"><span className="text-zinc-600">›</span>{k}</li>)}
                </ul>
              )}
              <div className="mt-2 flex flex-col gap-1">
                {n.insight.impacts.map((x) => (
                  <span key={x.ticker} className="flex items-baseline gap-2 text-[11px]">
                    <span className={`rounded-sm px-1.5 font-bold ${DIR_CLS[x.direction]}`}>{x.ticker}</span>
                    <span className="text-zinc-400">{x.why}</span>
                  </span>
                ))}
              </div>
              {(!!n.insight.etfs?.length || !!n.insight.sectors?.length || n.insight.horizon) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                  {n.insight.etfs?.map((x) => <span key={x.ticker} className={`rounded-sm px-1.5 font-bold ${DIR_CLS[x.direction]}`}>ETF {x.ticker}</span>)}
                  {n.insight.sectors?.map((x) => <span key={x} className="rounded-sm border border-white/[0.1] px-1.5 text-zinc-400">{x}</span>)}
                  {n.insight.horizon && <span className="text-zinc-500">HORIZON: {n.insight.horizon.toUpperCase()}</span>}
                  {n.insight.confidence && <span className={n.insight.confidence === "low" ? "text-amber-400/80" : "text-zinc-500"}>CONF: {n.insight.confidence.toUpperCase()}</span>}
                </div>
              )}
              <div className="mt-2 text-[9px] tracking-[0.06em] text-zinc-600">{n.insight.fullText ? "LLM READ OF THE FULL ARTICLE" : "LLM READ OF HEADLINE + SUMMARY"} · CACHED · VERIFY BEFORE TRADING</div>
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

/** Market-moving headlines (DAILY / WEEKLY / MONTHLY, 1-3 impact bars). Scanner rail = newest first; NEWS page = most important first. */
export function NewsFeed({ limit = 25, order: order0 = "impact" }: { limit?: number; order?: "newest" | "impact" }) {
  const [news, setNews] = useState<News[] | null>(null);
  const [nr, setNr] = useState<NRange>("d");
  /** sort: most market impact first, or newest first */
  const [order, setOrder] = useState<"newest" | "impact">(order0);
  const [feed, setFeed] = useState({ live: true, collecting: false, coverage: 30, backfilling: false });
  /* my portfolio, look-through (ETFs opened up) → which news touch what I own */
  const myPos = useMyPortfolio();
  const mineW = useMemo(() => lookThrough(myPos), [myPos]);
  useEffect(() => {
    let off = false;
    const load = () => fetch(`/api/pulse/news?limit=${limit}&range=${nr}&order=${order}`)
      .then((r) => (r.ok ? r.json() : { news: [] }))
      .then((j: { news?: News[]; live?: boolean; collecting?: boolean; coverageDays?: number; backfilling?: boolean }) => {
        if (off) return;
        setNews(j.news ?? []); setFeed({ live: j.live !== false, collecting: !!j.collecting, coverage: j.coverageDays ?? 30, backfilling: !!j.backfilling });
        // first start: archive still being filled → look again shortly
        if (j.live === false) retry = setTimeout(load, 20_000);
      })
      .catch(() => { if (!off) setNews([]); });
    let retry: ReturnType<typeof setTimeout> | undefined;
    void load();
    return () => { off = true; clearTimeout(retry); };
  }, [nr, limit, order]);
  /* strictly newest first (UTC epoch seconds) — impact stays visible on each row, it no longer reorders the feed */
  const [scope, setScope] = useState<"all" | "mine">("all");
  const shown = useMemo(() => {
    if (!news) return null;
    const list = scope === "mine" ? news.filter((n) => n.tickers.some((t) => (mineW[t] ?? 0) > 0)) : news;
    return order === "impact" ? [...list].sort((a, b) => (b.impactPts ?? 0) - (a.impactPts ?? 0) || b.ts - a.ts) : [...list].sort((a, b) => b.ts - a.ts);
  }, [news, scope, mineW, order]);
  const setInsight = (id: string, i: Insight) => setNews((l) => l?.map((n) => (n.id === id ? { ...n, insight: i } : n)) ?? l);
  return (
    <>
        <H t="MARKET-MOVING NEWS" sub="LIVE" />
        <div className="grid grid-cols-3 gap-1.5 px-3 py-2">
          {NRANGES.map(([k, l]) => (
            <button key={k} type="button" onClick={() => { if (k !== nr) { setNews(null); setNr(k); } }}
              className={`h-6 rounded-full border font-mono text-[9.5px] font-bold tracking-[0.12em] transition-colors ${nr === k ? "oasis-on" : "border-white/[0.08] text-zinc-500 hover:text-zinc-200"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 px-3 pb-2 font-mono text-[9.5px] font-bold tracking-[0.12em]">
          {myPos.length > 0 && ([["all", "ALL"], ["mine", "MY HOLDINGS"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setScope(k)} aria-pressed={scope === k}
              className={`h-5 rounded-sm border px-2 ${scope === k ? "oasis-on" : "border-white/[0.08] text-zinc-500 hover:text-zinc-200"}`}>{l}</button>
          ))}
          <span className="ml-auto flex rounded-sm border border-white/[0.08] p-px" role="group" aria-label="Sort news">
            {([["impact", "IMPORTANT"], ["newest", "NEWEST"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => { if (k !== order) { setNews(null); setOrder(k); } }} aria-pressed={order === k}
                title={k === "impact" ? "Biggest market impact first" : "Most recent first"}
                className={`h-[18px] rounded-sm px-2 ${order === k ? "oasis-on" : "text-zinc-500 hover:text-zinc-200"}`}>{l}</button>
            ))}
          </span>
        </div>
        {feed.live && nr !== "d" && feed.coverage < (nr === "w" ? 6 : 25) && (
          <p className="m-0 mx-3 mb-1 rounded-sm border border-white/[0.08] px-2 py-1 font-mono text-[9.5px] leading-snug text-zinc-400">
            Archive covers only the last {feed.coverage.toFixed(1)} days{feed.backfilling ? " — downloading older news now, this fills in by itself" : " — older news is downloaded automatically when FINNHUB_API_KEY is set"}.
          </p>
        )}
        {!feed.live && news && news.length > 0 && (
          <p className="m-0 mx-3 mb-1 rounded-sm border border-amber-400/20 bg-amber-400/[0.05] px-2 py-1 font-mono text-[9.5px] leading-snug text-amber-300/90">
            SAMPLE EVENTS — {feed.collecting ? "collecting live news now, this updates by itself" : "live archive is empty; add FINNHUB_API_KEY to .env.local for full coverage"}
          </p>
        )}
        <div className="flex flex-col">
          {news === null && Array.from({ length: 5 }, (_, i) => <div key={i} className="mx-3 my-1.5 h-9 animate-pulse rounded-sm bg-white/[0.03]" />)}
          {shown?.map((n) => <NewsRow key={n.id} n={n} onInsight={setInsight} mine={mineW} />)}
          {news && news.length > 0 && shown?.length === 0 && <p className="m-0 px-3 py-3 font-mono text-[11px] text-zinc-600">No headlines about your holdings in this window.</p>}
          {news?.length === 0 && (
            <p className="m-0 px-3 py-3 font-mono text-[11px] leading-relaxed text-zinc-600">
              No headlines yet — the news collector fills this once it runs (needs FINNHUB_API_KEY).
            </p>
          )}
        </div>
    </>
  );
}

export default function MarketPulse({ rows, all = ETFS }: { rows: EtfRow[]; /** every ETF (with live numbers) for MOST ACTIVE */ all?: EtfRow[] }) {
  const [tf, setTf] = useState<Tf>("1D");
  /* real window returns (1D = live move vs previous close; 1W / 1M from stored closes) */
  const syms = useMemo(() => [...new Set([...all, ...rows].map((e) => e.ticker))], [all, rows]);
  const win = useHoldingReturns(syms, tf);
  const r = (e: EtfRow): number | null => (tf === "1D" ? e.chg1d : win.ret[e.ticker.toUpperCase()] ?? null);
  const loading = tf !== "1D" && win.state === "loading";
  const byMove = rows.map((e) => ({ e, m: r(e) })).filter((x): x is { e: EtfRow; m: number } => x.m != null && Number.isFinite(x.m)).sort((a, b) => b.m - a.m);
  const up = byMove.slice(0, 3).filter((x) => x.m > 0);
  const down = byMove.slice(-3).reverse().filter((x) => x.m < 0);



  return (
    <aside className="flex min-h-0 flex-col overflow-hidden oasis-glass border border-white/[0.06] bg-[var(--oasis-panel)]">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Most active — bar length = $ volume, colour = today's move */}
        {/* timeframe for both modules below */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-1.5">
          <span className="font-mono text-[9.5px] font-bold tracking-[0.14em] text-zinc-500">WINDOW</span>
          <div role="tablist" aria-label="Most active and top movers window" className="flex rounded-[2px] border border-white/[0.06] bg-[var(--oasis-bg)] p-0.5">
            {TFS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tf === t} onClick={() => setTf(t)}
                title={t === "1D" ? "Today" : t === "1W" ? "Last 5 sessions" : "Last month"}
                className={`h-5 min-w-9 rounded-[2px] px-2 font-mono text-[10px] font-bold tracking-[0.08em] ${tf === t ? "bg-[rgba(0,229,153,0.12)] text-[#00E599]" : "text-zinc-500 hover:text-zinc-200"}`}>{t}</button>
            ))}
          </div>
          {loading && <span className="font-mono text-[9.5px] text-zinc-600">loading…</span>}
        </div>
        {/* Top movers in the current view */}
        <H t={`TOP MOVERS · ${tf}`} />
        <div className="py-1">
          {[...up, ...down].map(({ e, m }, i) => (
            <Link key={e.ticker} href={`/etf/${e.ticker}`}
              className={`grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-[5px] font-mono text-[12px] tabular-nums transition-colors duration-75 hover:bg-white/[0.03] ${i === up.length && up.length ? "border-t border-white/[0.05]" : ""}`}>
              <span className="font-bold text-zinc-100">{e.ticker}</span>
              <span className="truncate font-sans text-[11.5px] text-zinc-500">{e.name}</span>
              <Pct v={m} />
            </Link>
          ))}
          {!up.length && !down.length && <p className="m-0 px-3 py-2 font-mono text-[11px] text-zinc-600">No moves in this view.</p>}
        </div>

        <NewsFeed limit={25} />
      </div>
    </aside>
  );
}
