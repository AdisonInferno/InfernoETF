"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import InfernoChart from "@/components/InfernoChart";
import type { EtfRow } from "@/lib/etfs";
import type { FundData } from "@/components/deep-view/types";
import { QUOTE } from "@/lib/fund-profiles";

/* ─────────────────────────────────────────────────────────────
   ETF DEEP-DIVE COCKPIT — opens when a fund is clicked in the scanner.
   12-col grid of widgets:
   ┌ header: ticker · name · live price · day change · [ ☆ FAVORITE ] ───────────┐
   │ A  CHART (8×2) — ETF vs overlays, zoom/pan  │ B  TOP 5 HOLDINGS · PRE-MKT  │
   │                                              │ C  HOLDINGS NEWS             │
   │ D  [ SYSTEM PENDING: MACRO CORRELATION MATRIX ]  (12)                         │
   └──────────────────────────────────────────────────────────────────────────────┘
   Prices: /api/prices (history) and /api/quotes (live, incl. pre/post market) from Yahoo.
   If those can't be reached the chart falls back to labelled model data.
   ───────────────────────────────────────────────────────────── */

const MONO = "font-['JetBrains_Mono_Variable','JetBrains_Mono',ui-monospace,monospace]";
const FAV_KEY = "inferno.favorites.v1";

interface Quote { price: number; prevClose: number; chg: number; session: "PRE" | "REG" | "POST" | "CLOSED"; currency: string; exchange: string }
interface News { id: string; ts: number; headline: string; url: string; source: string; tickers: string[] }

const sgn = (v: number, d = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}%`;
const tone = (v: number) => (v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-400");

function Widget({ title, right, className = "", children }: { title: string; right?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`flex min-h-0 min-w-0 flex-col rounded-sm border border-white/[0.05] bg-[#0a0a0c] ${className}`}>
      <header className="flex flex-none items-center justify-between gap-2 border-b border-white/[0.05] px-3 py-1.5">
        <span className={`${MONO} text-[10.5px] font-bold tracking-[0.14em] text-zinc-300`}>[ {title} ]</span>
        {right}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

/* ── B · holdings + pre-market ─────────────────────────────── */
function Holdings({ fund, quotes }: { fund: FundData; quotes: Record<string, Quote | null> | null }) {
  const top = fund.holdings.slice(0, 5);
  const top5w = top.reduce((s, h) => s + h.w, 0);
  const cols = "grid grid-cols-[46px_50px_minmax(84px,1fr)_58px_46px] items-center gap-1.5";
  return (
    <div className={`${MONO} flex h-full flex-col text-[11px] tabular-nums`}>
      <div className={`${cols} border-b border-white/[0.05] px-3 py-1 text-[9px] tracking-[0.12em] text-zinc-600`}>
        <span>TICKER</span><span className="text-right">WEIGHT</span><span className="text-right">PRICE</span><span className="text-right">CHG</span><span className="text-right">CONTRIB</span>
      </div>
      {top.map((h) => {
        const q = quotes?.[h.tic] ?? null;
        const contrib = q ? (h.w * q.chg) / 100 : null;
        return (
          <div key={h.tic} className={`${cols} border-b border-white/[0.03] px-3 py-[7px]`} title={h.name}>
            <span className="font-bold text-zinc-100">{h.tic}</span>
            <span className="text-right text-zinc-300">{h.w.toFixed(2)}%</span>
            <span className="flex items-center justify-end gap-1.5 text-zinc-200">
              {q && q.session !== "REG" && <span className={`rounded-sm px-1 text-[8.5px] font-bold ${q.session === "PRE" ? "bg-sky-400/15 text-sky-300" : q.session === "POST" ? "bg-violet-400/15 text-violet-300" : "bg-white/[0.06] text-zinc-500"}`}>{q.session}</span>}
              {quotes === null ? <span className="h-3 w-12 animate-pulse rounded bg-white/[0.05]" /> : q ? q.price.toFixed(2) : "—"}
            </span>
            <span className={`text-right font-bold ${q ? tone(q.chg) : "text-zinc-600"}`}>{q ? sgn(q.chg) : "—"}</span>
            <span className={`text-right ${contrib != null ? tone(contrib) : "text-zinc-600"}`}>{contrib != null ? `${contrib >= 0 ? "+" : "−"}${Math.abs(contrib).toFixed(2)}` : "—"}</span>
          </div>
        );
      })}
      <div className="mt-auto flex justify-between border-t border-white/[0.05] px-3 py-1.5 text-[9.5px] tracking-[0.06em] text-zinc-600">
        <span>TOP 5 = {top5w.toFixed(1)}% OF FUND · {fund.positions} POSITIONS</span>
        <span>CONTRIB = PP OF ETF MOVE</span>
      </div>
    </div>
  );
}

/* ── C · holdings news ─────────────────────────────────────── */
const FILING_RE = /\b(8-K|10-K|10-Q|13F|13D|13G|S-1|S-3|DEF 14A|Form 4|SEC filing|files? with (the )?SEC|filing)\b/i;
const isFiling = (n: News) => FILING_RE.test(n.headline) || /\bsec\b|edgar/i.test(n.source);
/** Rule-of-thumb importance 1–3 (heuristic, not AI): hard catalysts = 3, company-specific news = 2, opinion/listicles = 1 */
function newsWeight(n: News): 1 | 2 | 3 {
  const h = n.headline;
  if (/earnings|guidance|revenue|profit|plunge|soar|sinks|surge|acqui|merger|buyout|lawsuit|probe|ban|tariff|sanction|downgrade|upgrade|recall|ceo|layoff|8-K|bankrupt|record/i.test(h)) return 3;
  if (/\?|vs\.?|should you|is it time|buy now|top \d|best \d|reasons|motley|trefis/i.test(h + " " + n.source)) return 1;
  return 2;
}
const W_CLS = ["", "border-zinc-700 text-zinc-500", "border-amber-500/40 text-amber-300", "border-rose-500/50 bg-rose-500/10 text-rose-300"];
function HoldingsNews({ tickers }: { tickers: string[] }) {
  const [open, setOpen] = useState(true);
  const [only, setOnly] = useState<string | null>(null);
  const [st, setSt] = useState<{ key: string; news: News[] } | null>(null);
  const key = tickers.join(",");
  useEffect(() => {
    let off = false;
    fetch(`/api/holdings-news?tickers=${key}`)
      .then((r) => r.json())
      .then((j: { news?: News[] }) => { if (!off) setSt({ key, news: j.news ?? [] }); })
      .catch(() => { if (!off) setSt({ key, news: [] }); });
    return () => { off = true; };
  }, [key]);
  const list = st?.key === key ? st.news.filter((n) => !only || n.tickers.includes(only)) : null;
  const fmt = (ts: number) => new Date(ts * 1000).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).toUpperCase();
  return (
    <div className={`${MONO} flex h-full flex-col`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex flex-none items-center justify-between border-b border-white/[0.05] px-3 py-1.5 text-left text-[10px] font-bold tracking-[0.12em] text-zinc-400 hover:text-white">
        [ VIEW NEWS FOR: TOP HOLDINGS ] <span>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <>
          <div className="flex flex-none flex-wrap gap-1 px-3 py-1.5">
            {[null, ...tickers].map((t) => (
              <button key={t ?? "ALL"} type="button" onClick={() => setOnly(t)}
                className={`rounded-sm border px-1.5 py-px text-[10px] font-bold transition-all duration-75 ${only === t ? "border-white/[0.2] bg-white/[0.08] text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}>
                {t ?? "ALL"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list === null && [0, 1, 2, 3].map((i) => <div key={i} className="mx-3 my-1.5 h-8 animate-pulse rounded-sm bg-white/[0.03]" />)}
            {list?.map((n) => { const w = newsWeight(n); const f = isFiling(n); return (
              <a key={n.id} href={n.url} target="_blank" rel="noreferrer"
                className={`flex flex-col gap-0.5 border-b px-3 py-1.5 ${f ? "border-cyan-400/30 bg-cyan-400/[0.07] shadow-[inset_3px_0_0_#22d3ee,0_0_14px_rgba(34,211,238,0.25)] hover:bg-cyan-400/[0.12]" : "border-white/[0.03] hover:bg-white/[0.03]"}`}>
                <span className="flex items-center gap-2 text-[9.5px] tracking-[0.06em] text-zinc-600">
                  <span title={`Importance ${w}/3 (heuristic)`} className={`flex-none rounded-sm border px-1 text-[9.5px] font-bold ${W_CLS[w]}`}>{"▮".repeat(w)}{"▯".repeat(3 - w)} {w}</span>
                  {f && <span className="flex-none rounded-sm bg-cyan-400/20 px-1 text-[9.5px] font-bold text-cyan-300">FILING</span>}
                  <span className="text-zinc-500">{fmt(n.ts)}</span>
                  <span className="truncate">{n.source.toUpperCase()}</span>
                  <span className="ml-auto flex gap-1">{n.tickers.slice(0, 3).map((t) => <span key={t} className="font-bold text-zinc-300">{t}</span>)}</span>
                </span>
                <span className={`line-clamp-2 font-sans text-[12px] leading-snug ${f ? "text-cyan-100" : "text-zinc-200"}`}>{n.headline}</span>
              </a>
            ); })}
            {list?.length === 0 && <p className="m-0 px-3 py-3 text-[10.5px] text-zinc-600">No news on these holdings in the last 14 days.</p>}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Cockpit ───────────────────────────────────────────────── */
export default function EtfDeepDiveCockpit({ etf, fund }: { etf: EtfRow; fund: FundData }) {
  const [expanded, setExpanded] = useState(false);
  const [fav, setFav] = useState(false);
  const [quotes, setQuotes] = useState<{ key: string; q: Record<string, Quote | null> } | null>(null);
  const holdings = useMemo(() => fund.holdings.slice(0, 5).map((h) => h.tic), [fund]);
  const qKey = [etf.ticker, ...holdings].join(",");

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read per-browser favourites after mount
      setFav((JSON.parse(window.localStorage.getItem(FAV_KEY) ?? "[]") as string[]).includes(etf.ticker));
    } catch { /* ignore */ }
  }, [etf.ticker]);
  const toggleFav = () => {
    try {
      const cur = JSON.parse(window.localStorage.getItem(FAV_KEY) ?? "[]") as string[];
      const next = cur.includes(etf.ticker) ? cur.filter((t) => t !== etf.ticker) : [etf.ticker, ...cur];
      window.localStorage.setItem(FAV_KEY, JSON.stringify(next));
      setFav(next.includes(etf.ticker));
    } catch { setFav((f) => !f); }
  };

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
          <Link href={`/etf/${etf.ticker}`} className="h-7 rounded-sm border border-white/[0.08] px-2.5 py-1 text-[10.5px] font-bold tracking-[0.1em] text-zinc-400 transition-all duration-75 hover:border-white/[0.2] hover:text-white">
            [ FULL DEEP VIEW → ]
          </Link>
        </span>
      </div>

      {/* Widget grid */}
      <div className="grid min-h-0 flex-1 grid-cols-12 grid-rows-[minmax(0,1fr)_minmax(0,1fr)_72px] gap-2 max-xl:grid-rows-[420px_300px_300px_72px]">
        <Widget title={`${etf.ticker} · PERFORMANCE`} right={chartControls}
          className={expanded ? "fixed inset-3 z-[90] shadow-none" : "col-span-8 row-span-2 max-xl:col-span-12 max-xl:row-span-1"}>
          <div className="h-full p-2"><InfernoChart key={etf.ticker} main={{ id: etf.ticker, label: etf.ticker, sym: etf.ticker, color: "#f87171" }} pinned={chartPinned} picker={chartPicker} /></div>
        </Widget>
        <Widget title="TOP 5 HOLDINGS · LIVE / PRE-MKT" className="col-span-4 max-xl:col-span-12">
          <Holdings fund={fund} quotes={q} />
        </Widget>
        <Widget title="HOLDINGS NEWS" className="col-span-4 max-xl:col-span-12">
          <HoldingsNews tickers={holdings} />
        </Widget>
        <div className={`${MONO} col-span-12 flex items-center justify-center rounded-sm border border-dashed border-white/[0.08] text-[10.5px] tracking-[0.18em] text-zinc-600`}>
          [ SYSTEM PENDING: MACRO CORRELATION MATRIX ]
        </div>
      </div>
      {expanded && <div className="fixed inset-0 z-[89] bg-[#030303]/90" onClick={() => setExpanded(false)} />}
    </div>
  );
}
