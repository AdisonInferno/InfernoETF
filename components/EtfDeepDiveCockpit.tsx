"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ColorType, CrosshairMode, LineSeries, LineStyle, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
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
const TF = [
  ["1D", "1d"], ["1W", "5d"], ["1M", "1mo"], ["YTD", "ytd"], ["1Y", "1y"], ["5Y", "5y"], ["MAX", "max"],
] as const;
type Tf = (typeof TF)[number][1];
const OVERLAYS = ["SPY", "QQQ", "ACWI"] as const;
const OV_COLOR: Record<string, string> = { SPY: "#a1a1aa", QQQ: "#60a5fa", ACWI: "#c084fc" };
const FAV_KEY = "inferno.favorites.v1";

type Series = { t: number[]; c: number[] } | null;
interface Quote { price: number; prevClose: number; chg: number; session: "PRE" | "REG" | "POST" | "CLOSED"; currency: string; exchange: string }
interface News { id: string; ts: number; headline: string; url: string; source: string; tickers: string[] }

const sgn = (v: number, d = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}%`;
const tone = (v: number) => (v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-400");

/** Deterministic fallback path when live history is unavailable */
function mockSeries(sym: string, tf: Tf, endTs: number): { t: number[]; c: number[] } {
  const n = { "1d": 78, "5d": 65, "1mo": 22, ytd: 200, "1y": 252, "5y": 260, max: 240 }[tf];
  const step = { "1d": 300, "5d": 1800, "1mo": 86400, ytd: 86400, "1y": 86400, "5y": 604800, max: 2629800 }[tf];
  let h = 0;
  for (const ch of sym + tf) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
  let p = 100;
  const t: number[] = [], c: number[] = [];
  for (let i = 0; i < n; i++) { t.push(endTs - (n - 1 - i) * step); p *= 1 + (rnd() - 0.48) * 0.02; c.push(p); }
  return { t, c };
}

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

/* ── A · chart ─────────────────────────────────────────────── */
function CompareChart({ ticker, tf, overlays }: { ticker: string; tf: Tf; overlays: string[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const syms = useMemo(() => [ticker, ...overlays.filter((o) => o !== ticker)], [ticker, overlays]);
  const [data, setData] = useState<{ key: string; series: Record<string, Series>; model: boolean } | null>(null);
  const key = `${syms.join(",")}:${tf}`;

  useEffect(() => {
    let off = false;
    fetch(`/api/prices?symbols=${syms.join(",")}&range=${tf}`)
      .then((r) => r.json())
      .then((j: { series: Record<string, Series> }) => {
        if (off) return;
        const end = Math.floor(Date.now() / 1000);
        const model = !j.series?.[ticker];
        const series = Object.fromEntries(syms.map((s) => [s, j.series?.[s] ?? mockSeries(s, tf, end)]));
        setData({ key, series, model });
      })
      .catch(() => {
        if (off) return;
        const end = Math.floor(Date.now() / 1000);
        setData({ key, series: Object.fromEntries(syms.map((s) => [s, mockSeries(s, tf, end)])), model: true });
      });
    return () => { off = true; };
  }, [key, syms, tf, ticker]);

  // chart instance
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0a0a0c" }, textColor: "#71717a", fontFamily: "'JetBrains Mono Variable','JetBrains Mono',monospace", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: "rgba(255,255,255,0.025)" }, horzLines: { color: "rgba(255,255,255,0.035)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.05)" },
      timeScale: { borderColor: "rgba(255,255,255,0.05)", timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "rgba(255,255,255,0.2)", style: LineStyle.Dashed, labelBackgroundColor: "#27272a" }, horzLine: { color: "rgba(255,255,255,0.2)", style: LineStyle.Dashed, labelBackgroundColor: "#27272a" } },
      handleScroll: true, handleScale: true,
      localization: { priceFormatter: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` },
    });
    chartRef.current = chart;
    // refit when the widget is resized (e.g. [ EXPAND ])
    const refit = () => requestAnimationFrame(() => chart.timeScale().fitContent());
    chart.timeScale().subscribeSizeChange(refit);
    const map = seriesRef.current;
    return () => { chart.remove(); chartRef.current = null; map.clear(); };
  }, []);

  // series: % change from the first point, so ETF and overlays share one axis
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !data || data.key !== key) return;
    const map = seriesRef.current;
    for (const [s, ser] of map) if (!syms.includes(s)) { chart.removeSeries(ser); map.delete(s); }
    for (const s of syms) {
      const d = data.series[s];
      if (!d || d.c.length < 2) continue;
      let ser = map.get(s);
      if (!ser) {
        ser = chart.addSeries(LineSeries, s === ticker
          ? { color: "#f87171", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: s }
          : { color: OV_COLOR[s] ?? "#a1a1aa", lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: true, title: s });
        map.set(s, ser);
      }
      const base = d.c[0];
      const pts = new Map<number, number>();
      d.t.forEach((t, i) => pts.set(t, ((d.c[i] - base) / base) * 100)); // de-dup timestamps
      ser.setData([...pts].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ time: t as UTCTimestamp, value: v })));
    }
    chart.timeScale().fitContent();
  }, [data, key, syms, ticker]);

  const ret = (s: string) => {
    const d = data?.series[s];
    return d && d.c.length > 1 ? ((d.c[d.c.length - 1] - d.c[0]) / d.c[0]) * 100 : null;
  };

  return (
    <div className="relative h-full w-full">
      <div ref={boxRef} className="absolute inset-0" />
      <div className={`${MONO} pointer-events-none absolute left-2 top-1.5 z-10 flex flex-wrap gap-x-3 text-[10.5px] tabular-nums`}>
        {syms.map((s) => {
          const r = ret(s);
          return (
            <span key={s} className="flex items-center gap-1.5">
              <span className="h-0.5 w-3" style={{ background: s === ticker ? "#f87171" : OV_COLOR[s] ?? "#a1a1aa" }} />
              <span className="text-zinc-300">{s}</span>
              {r != null && <span className={tone(r)}>{sgn(r)}</span>}
            </span>
          );
        })}
        {data?.model && <span className="text-amber-400/80">MODEL DATA · LIVE PRICES UNAVAILABLE</span>}
      </div>
    </div>
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
            {list?.map((n) => (
              <a key={n.id} href={n.url} target="_blank" rel="noreferrer" className="flex flex-col gap-0.5 border-b border-white/[0.03] px-3 py-1.5 hover:bg-white/[0.03]">
                <span className="flex items-center gap-2 text-[9.5px] tracking-[0.06em] text-zinc-600">
                  <span className="text-zinc-500">{fmt(n.ts)}</span>
                  <span className="truncate">{n.source.toUpperCase()}</span>
                  <span className="ml-auto flex gap-1">{n.tickers.slice(0, 3).map((t) => <span key={t} className="font-bold text-zinc-300">{t}</span>)}</span>
                </span>
                <span className="line-clamp-2 font-sans text-[12px] leading-snug text-zinc-200">{n.headline}</span>
              </a>
            ))}
            {list?.length === 0 && <p className="m-0 px-3 py-3 text-[10.5px] text-zinc-600">No news on these holdings in the last 14 days.</p>}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Cockpit ───────────────────────────────────────────────── */
export default function EtfDeepDiveCockpit({ etf, fund }: { etf: EtfRow; fund: FundData }) {
  const [tf, setTf] = useState<Tf>("1y");
  const [overlays, setOverlays] = useState<string[]>(["SPY"]);
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
    <div className={`${MONO} flex items-center gap-2`}>
      <div className="flex rounded-sm border border-white/[0.05] bg-[#030303] p-0.5">
        {TF.map(([l, v]) => (
          <button key={v} type="button" onClick={() => setTf(v)} aria-pressed={tf === v}
            className={`h-6 rounded-sm px-1.5 text-[10px] font-bold transition-all duration-75 ${tf === v ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:text-zinc-100"}`}>{l}</button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[9px] tracking-[0.12em] text-zinc-600">VS</span>
        {OVERLAYS.filter((o) => o !== etf.ticker).map((o) => {
          const on = overlays.includes(o);
          return (
            <button key={o} type="button" onClick={() => setOverlays((l) => (on ? l.filter((x) => x !== o) : [...l, o]))} aria-pressed={on}
              className={`h-6 rounded-sm border px-1.5 text-[10px] font-bold transition-all duration-75 ${on ? "border-white/[0.2] bg-white/[0.06]" : "border-transparent text-zinc-600 hover:text-zinc-200"}`}
              style={on ? { color: OV_COLOR[o] } : undefined}>{o}</button>
          );
        })}
      </div>
      <button type="button" onClick={() => setExpanded((e) => !e)}
        className="h-6 rounded-sm border border-white/[0.08] px-2 text-[10px] font-bold tracking-[0.1em] text-zinc-400 transition-all duration-75 hover:border-white/[0.2] hover:text-white">
        [ {expanded ? "COLLAPSE" : "EXPAND"} ]
      </button>
    </div>
  );

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
          <CompareChart ticker={etf.ticker} tf={tf} overlays={overlays} />
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
