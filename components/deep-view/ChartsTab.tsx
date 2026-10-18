"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import InfernoChart, { SegRail, at, basketSeries, type MainDef, type Raw } from "@/components/InfernoChart";
import { usePersisted } from "@/lib/persisted";
import type { FundData } from "./types";
import { BREADTH, MONTHS } from "./mockData";
import { METRIC_INFO, MODEL_NOTE } from "./metricInfo";
import { usePriceSeries, type RetState } from "./useHoldingReturns";

/* ─────────────────────────────────────────────────────────────
   CHARTS — one analysis at a time, grouped by the investor's question:
     PERFORMANCE        how has it grown vs its benchmark / peers?       (terminal chart + window stats)
     RISK & DRAWDOWN    how deep and how long were the falls?            (underwater chart vs S&P 500)
     ANNUAL & MONTHLY   how consistent were the returns?                 (seasonality matrix, calendar years)
     INCOME             what does it distribute?
     MARKET CONTEXT     market-wide tools, not specific to this ETF      (cap- vs equal-weight breadth)
   Real prices from /api/prices; anything modelled is labelled.
   ───────────────────────────────────────────────────────────── */

const CARD = "oasis-glass border border-white/[0.06] bg-[var(--oasis-panel)]";
const H_LABEL = "font-display text-[10.5px] font-bold tracking-[0.18em] text-neutral-300";
const DAY = 86400;

type Group = "PERF" | "RISK" | "ANNUAL" | "INCOME" | "MARKET";
const GROUPS: [Group, string, string][] = [
  ["PERF", "PERFORMANCE", "Growth vs benchmark and peers, with return, CAGR, drawdown and volatility of the visible window"],
  ["RISK", "RISK & DRAWDOWN", "Peak-to-trough falls over time vs the S&P 500, plus the fund's risk metrics"],
  ["ANNUAL", "ANNUAL & MONTHLY", "Monthly and calendar-year returns — how consistent the results were"],
  ["INCOME", "INCOME", "Distribution yield and policy"],
  ["MARKET", "MARKET CONTEXT", "Market-wide tools that are not specific to this ETF"],
];
const DEFAULT_GROUP: Group = "PERF";

const sg1 = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(1);
const ym = (t: number) => new Date(t * 1000).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase();

/** The main line's closes for a range: one instrument, or a weighted basket (portfolio). */
function useMainSeries(main: MainDef, range: string | null): { raw: Raw | null; state: RetState } {
  const syms = useMemo(() => (main.sym ? [main.sym] : (main.basket ?? []).map((b) => b.sym)), [main]);
  const px = usePriceSeries(syms, range);
  const raw = useMemo(() => {
    if (px.state === "loading") return null;
    if (main.sym) return px.series[main.sym.toUpperCase()] ?? null;
    const parts = (main.basket ?? []).flatMap((b) => { const s = px.series[b.sym.toUpperCase()]; return s ? [{ s, w: b.weight }] : []; });
    return basketSeries(parts);
  }, [px, main]);
  return { raw, state: px.state };
}

/** Loading / failed / no-data message in the chart area — never a blank box. */
function DataState({ state, label, h = 220, children }: { state: RetState | "empty"; label: string; h?: number; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-sm border border-dashed border-white/[0.08] text-center font-mono text-[11px] text-zinc-500" style={{ height: h }}>
      {state === "loading" ? <span className="animate-pulse tracking-[0.12em]">LOADING PRICE HISTORY…</span>
        : state === "error" ? <><span className="font-bold tracking-[0.12em] text-amber-400/80">PRICE REQUEST FAILED</span><span>Could not reach the price service for {label}. Try again later.</span></>
        : <><span className="font-bold tracking-[0.12em] text-zinc-400">NO PRICE HISTORY</span><span>The price service has no history for {label} over this range.</span></>}
      {children}
    </div>
  );
}

const ModelBadge = ({ why }: { why: string }) => (
  <span title={why} className="cursor-help rounded-sm bg-amber-400/10 px-1.5 py-px font-mono text-[9.5px] font-bold tracking-[0.1em] text-amber-300">MODEL DATA</span>
);

/* ── PERFORMANCE ───────────────────────────────────────────── */

function Performance({ fund, main }: { fund: FundData; main: MainDef }) {
  const ccy = fund.meta.find(([k]) => k === "CURRENCY")?.[1];
  const pinned = useMemo(() => [
    { id: "SPY", label: "S&P 500 (SPY)", sym: "SPY", color: "#a1a1aa", dashed: true },
    ...fund.alts.map((a, i) => ({ id: `peer:${a.tic}`, label: a.tic, sym: a.tic, color: ["#60a5fa", "#f59e0b", "#f472b6"][i % 3] })),
  ].filter((l) => l.sym !== main.sym), [fund.alts, main.sym]);
  const picker = useMemo(() => fund.holdings.slice(0, 30).map((h) => ({ sym: h.tic, label: h.tic, sub: `${h.w.toFixed(2)}% · ${h.name}` })), [fund.holdings]);
  return (
    <div className={`flex flex-col gap-2 p-3 ${CARD}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 font-mono">
        <span className={H_LABEL}>{main.label} VS BENCHMARK</span>
        <span className="flex flex-wrap items-center gap-2 text-[9.5px] tracking-[0.08em] text-zinc-500">
          <span title="In % mode every line starts at 0% on the first visible bar, so lines are directly comparable">% MODE = REBASED TO THE FIRST VISIBLE BAR · PRICE RETURN</span>
          {ccy && ccy !== "USD" && <span className="rounded-sm bg-amber-400/10 px-1.5 py-px font-bold text-amber-300" title={`${main.label} trades in ${ccy}; the S&P 500 line is in USD — the gap includes currency moves`}>{ccy} VS USD</span>}
        </span>
      </div>
      <div className="h-[560px]">
        <InfernoChart key={main.id} main={main} pinned={pinned} picker={picker} groupLabel="LOWER-TER PEERS" initialTf="5Y" initialUnit="PCT" stats />
      </div>
    </div>
  );
}

/* ── RISK & DRAWDOWN ───────────────────────────────────────── */

type DdTf = "1Y" | "3Y" | "5Y" | "MAX";
const DD_TFS: DdTf[] = ["1Y", "3Y", "5Y", "MAX"];
const DD_RANGE: Record<DdTf, string> = { "1Y": "1y", "3Y": "5y", "5Y": "5y", MAX: "max" };
const DD_DAYS: Record<DdTf, number> = { "1Y": 365, "3Y": 1096, "5Y": 1826, MAX: Infinity };

function drawdown(s: Raw, from: number) {
  const t: number[] = [], d: number[] = [];
  let peak = -Infinity, min = 0, minT = 0;
  s.t.forEach((ts, i) => {
    if (ts < from) return;
    const c = s.c[i];
    peak = Math.max(peak, c);
    const v = (c / peak - 1) * 100;
    t.push(ts); d.push(v);
    if (v < min) { min = v; minT = ts; }
  });
  return { t, d, min, minT, cur: d[d.length - 1] ?? 0 };
}

function RiskDrawdown({ fund, main }: { fund: FundData; main: MainDef }) {
  const [tf, setTf] = useState<DdTf>("5Y");
  const range = DD_RANGE[tf];
  const m = useMainSeries(main, range);
  const bench = usePriceSeries(main.sym === "SPY" ? [] : ["SPY"], range);
  const spy = bench.series.SPY ?? null;

  const view = useMemo(() => {
    if (!m.raw || m.raw.t.length < 3) return null;
    const end = m.raw.t[m.raw.t.length - 1];
    const from = Math.max(m.raw.t[0], end - DD_DAYS[tf] * DAY);
    const a = drawdown(m.raw, from), b = spy && spy.t.length > 2 ? drawdown(spy, from) : null;
    const lo = Math.min(a.min, b?.min ?? 0, -1) * 1.08;
    const x = (ts: number) => ((ts - from) / Math.max(1, end - from)) * 1000, y = (v: number) => (v / lo) * 200;
    const path = (dd: { t: number[]; d: number[] }) => dd.t.map((ts, i) => `${i ? "L" : "M"}${x(ts).toFixed(1)},${y(dd.d[i]).toFixed(1)}`).join(" ");
    const area = path(a) + ` L${x(a.t[a.t.length - 1]).toFixed(1)},0 L${x(a.t[0]).toFixed(1)},0 Z`;
    const years: { x: number; l: string }[] = [];
    for (let yy = new Date(from * 1000).getUTCFullYear() + 1; yy <= new Date(end * 1000).getUTCFullYear(); yy++) years.push({ x: x(Date.UTC(yy, 0, 1) / 1000) / 10, l: String(yy) });
    const step = Math.ceil(years.length / 10);
    return { a, b, area, line: path(a), bline: b ? path(b) : null, lo, years: years.filter((_, i) => i % step === 0), short: m.raw.t[0] > end - DD_DAYS[tf] * DAY + 7 * DAY && tf !== "MAX", start: from };
  }, [m.raw, spy, tf]);

  const s = fund.stats;
  const risk: [string, string, string][] = [
    ["BETA", s.beta.toFixed(2), METRIC_INFO.BETA], ["30D VOL", s.vol30d.toFixed(1) + "%", METRIC_INFO.VOL_30D],
    ["SHARPE", s.sharpe.toFixed(2), METRIC_INFO.SHARPE], ["MAX DD", s.maxDD.toFixed(1) + "%", METRIC_INFO.MAX_DD],
  ];

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className={`flex min-w-0 flex-col gap-2.5 p-3 font-mono tabular-nums ${CARD}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={H_LABEL} title="Drawdown = how far the price is below its previous high, at every point in time">DRAWDOWN · {main.label}{spy ? " VS S&P 500" : ""}</span>
          <SegRail items={DD_TFS} value={tf} onChange={setTf} width={200} />
        </div>
        {!view ? <DataState state={m.state === "ready" ? "empty" : m.state} label={main.label} />
          : (
            <>
              <div className="relative h-[220px]">
                <svg viewBox="0 0 1000 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                  {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2="1000" y1={f * 200} y2={f * 200} stroke="rgba(255,255,255,0.04)" vectorEffect="non-scaling-stroke" />)}
                  <path d={view.area} fill="rgba(248,113,113,0.16)" stroke="none" />
                  <path d={view.line} fill="none" stroke="#f87171" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                  {view.bline && <path d={view.bline} fill="none" stroke="#a1a1aa" strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
                  <line x1="0" x2="1000" y1="0" y2="0" stroke="rgba(255,255,255,0.18)" vectorEffect="non-scaling-stroke" />
                </svg>
                {[0, 0.5, 1].map((f) => (
                  <span key={f} className="absolute -right-1 translate-x-full text-[9px] text-zinc-600" style={{ top: `calc(${f * 100}% - 6px)` }}>{(view.lo * f).toFixed(0)}%</span>
                ))}
              </div>
              <div className="relative h-3 text-[9.5px] text-zinc-600">
                {view.years.map((yy) => <span key={yy.l} className="absolute -translate-x-1/2" style={{ left: `${yy.x}%` }}>{yy.l}</span>)}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1.5 border-t border-white/[0.05] pt-2 text-[10.5px]">
                {[{ l: main.label, c: "#f87171", d: view.a }, ...(view.b ? [{ l: "S&P 500", c: "#a1a1aa", d: view.b }] : [])].map((r) => (
                  <span key={r.l} className="flex flex-wrap items-baseline gap-x-3">
                    <span className="flex items-center gap-1.5 font-bold text-zinc-200"><span className="h-0.5 w-3.5" style={{ background: r.c }} />{r.l}</span>
                    <span title={METRIC_INFO.MAX_DD}><span className="text-zinc-600">MAX DD </span><span className="text-rose-400">{r.d.min.toFixed(1)}%</span> <span className="text-zinc-600">({ym(r.d.minT)})</span></span>
                    <span title="How far the latest close is below the highest close of the window"><span className="text-zinc-600">NOW </span><span className={r.d.cur < -0.05 ? "text-rose-400" : "text-zinc-300"}>{r.d.cur.toFixed(1)}%</span></span>
                  </span>
                ))}
                <span className="ml-auto text-[9.5px] tracking-[0.08em] text-zinc-600">
                  {view.short ? `HISTORY FROM ${ym(view.start)} · ` : ""}FROM CLOSING PRICES · {tf === "1Y" ? "DAILY" : tf === "MAX" ? "MONTHLY" : "WEEKLY"} BARS
                </span>
              </div>
              {bench.state !== "loading" && !spy && main.sym !== "SPY" && <span className="text-[10px] text-zinc-600">S&amp;P 500 comparison unavailable ({bench.state === "error" ? "request failed" : "no data"}).</span>}
            </>
          )}
      </div>
      <div className={`flex flex-col gap-2 p-3 font-mono tabular-nums ${CARD}`}>
        <span className="flex items-center justify-between">
          <span className={H_LABEL}>RISK METRICS</span>
          <span title={MODEL_NOTE} className="cursor-help rounded-xs border border-white/[0.08] px-1 text-[8.5px] tracking-[0.08em] text-zinc-600">EST</span>
        </span>
        {risk.map(([l, v, hint]) => (
          <div key={l} title={hint} className="flex items-baseline justify-between border-b border-white/[0.04] py-1 text-[11px] last:border-b-0">
            <span className="cursor-help text-[9.5px] font-bold tracking-[0.12em] text-zinc-500 underline decoration-white/15 decoration-dotted underline-offset-[3px]">{l}</span>
            <span className="text-zinc-100">{v}</span>
          </div>
        ))}
        <p className="m-0 text-[9.5px] leading-snug text-zinc-600">Fund-model estimates. The drawdown chart and the Performance stats are computed from live closing prices.</p>
      </div>
    </div>
  );
}

/* ── ANNUAL & MONTHLY (seasonality matrix) ─────────────────── */

function heat(v: number | null, wide: boolean) {
  if (v == null) return { v: "·", bg: "transparent", fg: "#4B5563", fw: 400 };
  const t = Math.min(1, Math.abs(v) / 15), a = (0.16 + 0.24 * t).toFixed(2);
  return {
    v: wide ? (v > 0 ? "+" : "") + (Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(1)) : String(Math.round(v)),
    bg: Math.abs(v) < 0.5 ? "transparent" : v >= 0 ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})`,
    fg: t > 0.5 ? "#FFFFFF" : "#E5E7EB", fw: t > 0.5 ? 700 : 500,
  };
}

type SeasRows = [year: number, monthly: (number | null)[]][];

/** Calendar-month returns (last 5 years) from monthly closes; null where a month is missing. */
function monthlyRows(s: Raw): SeasRows | null {
  if (s.t.length < 3) return null;
  const ret = new Map<string, number>();
  for (let i = 1; i < s.t.length; i++) {
    // monthly bars are stamped at the start of the month (exchange time) — +12h keeps them in the right UTC month
    const d = new Date((s.t[i] + 43200) * 1000);
    ret.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}`, (s.c[i] / s.c[i - 1] - 1) * 100);
  }
  const last = new Date((s.t[s.t.length - 1] + 43200) * 1000).getUTCFullYear();
  const rows: SeasRows = [];
  for (let y = last - 4; y <= last; y++) rows.push([y, MONTHS.map((_, mm) => { const v = ret.get(`${y}-${mm}`); return v == null ? null : +v.toFixed(1); })]);
  return rows.filter(([, v]) => v.some((x) => x != null));
}

function Seasonality({ rows, badge, source }: { rows: SeasRows; badge?: ReactNode; source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver((en) => setWide(en[0].contentRect.width >= 360));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const d = useMemo(() => {
    const avg = MONTHS.map((_, m) => { const v = rows.map((y) => y[1][m]).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
    const flat = rows.flatMap((y) => y[1]).filter((x): x is number => x != null);
    const hit = flat.filter((x) => x > 0).length / Math.max(1, flat.length);
    const okAvg = avg.map((v, i) => [v, i] as const).filter((p): p is readonly [number, number] => p[0] != null);
    const bi = okAvg.reduce((b, p) => (p[0] > b[0] ? p : b), okAvg[0]), wi = okAvg.reduce((b, p) => (p[0] < b[0] ? p : b), okAvg[0]);
    const yt = (v: (number | null)[]) => (v.filter((x): x is number => x != null).reduce((q, x) => q * (1 + x / 100), 1) - 1) * 100;
    const lastYear = rows[rows.length - 1]?.[0];
    const full = rows.filter(([, v]) => v.every((x) => x != null));
    const ta = full.length ? full.reduce((q, [, v]) => q + yt(v), 0) / full.length : null;
    const tc = (t: number | null, tn: string) => ({ t: t == null ? "—" : (t >= 0 ? "+" : "") + t.toFixed(1), tn, tb: t == null ? "transparent" : t >= 0 ? `rgba(34,197,94,${Math.min(0.55, 0.2 + Math.abs(t) / 200).toFixed(2)})` : `rgba(239,68,68,${Math.min(0.55, 0.2 + Math.abs(t) / 200).toFixed(2)})` });
    const row = (y: string, vals: (number | null)[], isAvg: boolean) => ({ y, isAvg, cells: vals.map((v, m) => ({ ...heat(v, wide), ...(isAvg && v != null ? { fg: "#FFFFFF", fw: 700 } : {}), tip: `${MONTHS[m]} ${y} · ${v == null ? "n/a" : sg1(v) + "%"}` })) });
    const out = rows.map(([y, v]) => {
      const isFull = v.every((x) => x != null);
      return { ...row(String(y), v, false), ...tc(yt(v), y === lastYear && !isFull ? `${y} year-to-date (compounded)` : isFull ? `${y} full year (compounded)` : `${y} partial year (compounded, months with data)`) };
    }).concat([{ ...row("AVG", avg.map((v) => (v == null ? null : +v.toFixed(1))), true), ...tc(ta, full.length ? `Average full-year return ${full[0][0]}–${full[full.length - 1][0]}` : "No full calendar year in range") }]);
    return { rows: out, years: rows.length ? `${rows[0][0]}–${String(lastYear).slice(2)}` : "", stats: okAvg.length ? [
      { l: "BEST MONTH (AVG)", v: `${MONTHS[bi[1]]} ${sg1(bi[0])}`, c: "#4ADE80" }, { l: "WORST MONTH (AVG)", v: `${MONTHS[wi[1]]} ${sg1(wi[0])}`, c: "#F87171" }, { l: "POSITIVE MONTHS", v: Math.round(hit * 100) + "%", c: "#FFFFFF" },
    ] : [] };
  }, [rows, wide]);

  return (
    <div ref={ref} className={`flex min-w-0 flex-col ${CARD}`}>
      <div className="flex flex-col gap-2.5 p-3 font-mono tabular-nums">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className={H_LABEL}>SEASONALITY MATRIX · MONTHLY RETURNS</span>
          <span className="flex items-center gap-2 whitespace-nowrap text-[9.5px] text-gray-600">{badge}MONTHLY % · {d.years} · Σ YR = CALENDAR-YEAR RETURN · {source}</span>
        </div>
        <div className="grid grid-cols-[52px_repeat(12,minmax(0,1fr))_72px] gap-[3px] text-xs">
          <span />
          {MONTHS.map((m) => <span key={m} className="pb-[3px] text-center text-[9.5px] font-bold text-gray-400">{m[0]}</span>)}
          <span className="pb-[3px] text-center text-[9.5px] font-bold text-gray-200" title="Calendar-year return, compounded from the monthly returns">Σ YR</span>
          {d.rows.map((r) => (
            <div key={r.y} className="contents">
              <span className={`flex items-center text-[10px] font-bold ${r.isAvg ? "mt-1 text-white" : "text-gray-400"}`}>{r.y}</span>
              {r.cells.map((c, i) => (
                <span key={i} title={c.tip} className={`flex h-[30px] min-w-0 items-center justify-center overflow-hidden whitespace-nowrap hover:outline hover:outline-1 hover:outline-gray-200 ${r.isAvg ? "mt-1 " : ""}`} style={{ background: c.bg, color: c.fg, fontWeight: c.fw }}>{c.v}</span>
              ))}
              <span title={r.tn} className={`on-color flex h-[30px] items-center justify-center whitespace-nowrap font-bold text-white ${r.isAvg ? "mt-1 " : ""}`} style={{ background: r.tb }}>{r.t}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-x-2.5 gap-y-1 text-[9.5px] tracking-[0.08em] text-gray-300">
          {d.stats.map((st) => <span key={st.l}>{st.l} <span className="font-bold" style={{ color: st.c }}>{st.v}</span></span>)}
        </div>
      </div>
    </div>
  );
}

function AnnualMonthly({ fund, main }: { fund: FundData; main: MainDef }) {
  const m = useMainSeries(main, "max");
  const real = useMemo(() => (m.raw ? monthlyRows(m.raw) : null), [m.raw]);
  if (m.state === "loading") return <div className={`p-3 ${CARD}`}><DataState state="loading" label={main.label} /></div>;
  if (real?.length) return <Seasonality rows={real} source="LIVE MONTHLY CLOSES · PRICE RETURN" />;
  const why = m.state === "error" ? "The price request failed, so the matrix falls back to the fund model." : `No monthly price history for ${main.label}, so the matrix falls back to the fund model.`;
  return <Seasonality rows={fund.seasonality} source="FUND MODEL" badge={<ModelBadge why={`${why} ${MODEL_NOTE}`} />} />;
}

/* ── INCOME ────────────────────────────────────────────────── */

function Income({ fund }: { fund: FundData }) {
  const y = fund.stats.divYield;
  return (
    <div className={`flex max-w-[760px] flex-col gap-3 p-4 font-mono tabular-nums ${CARD}`}>
      <span className={H_LABEL}>INCOME &amp; DISTRIBUTIONS</span>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1" title={METRIC_INFO.DIV_YIELD}>
          <span className="cursor-help text-[9.5px] font-bold tracking-[0.12em] text-zinc-500 underline decoration-white/15 decoration-dotted underline-offset-[3px]">DIV YIELD</span>
          <span className="text-[18px] font-semibold text-zinc-100">{y.toFixed(2)}%</span>
        </div>
        <div className="flex flex-col gap-1" title="Accumulating funds reinvest income; distributing funds pay it out">
          <span className="text-[9.5px] font-bold tracking-[0.12em] text-zinc-500">POLICY</span>
          <span className="text-[13px] font-semibold text-zinc-100">{y === 0 ? "Accumulating" : "Distributing"}</span>
        </div>
        <div className="flex flex-col gap-1" title={METRIC_INFO.TER}>
          <span className="cursor-help text-[9.5px] font-bold tracking-[0.12em] text-zinc-500 underline decoration-white/15 decoration-dotted underline-offset-[3px]">TER</span>
          <span className="text-[13px] font-semibold text-zinc-100">{fund.ter.toFixed(2)}%</span>
        </div>
      </div>
      <p className="m-0 border-t border-white/[0.05] pt-2.5 text-[10.5px] leading-relaxed text-zinc-500">
        Distribution history (payment dates, amounts, growth) isn&apos;t available yet: the current price feed only returns closing prices.
        The yield above comes from the fund database. All performance figures in this terminal are <span className="text-zinc-300">price returns</span>, so distributing funds look weaker than their total return.
      </p>
    </div>
  );
}

/* ── MARKET CONTEXT: cap- vs equal-weight S&P 500 ──────────── */

function BreadthChart() {
  const px = usePriceSeries(["SPY", "RSP"], "5y");
  const live = useMemo(() => {
    const s = px.series.SPY, e = px.series.RSP;
    if (!s || !e || s.t.length < 10 || e.t.length < 10) return null;
    const t0 = Math.max(s.t[0], e.t[0]), grid = s.t.filter((ts) => ts >= t0);
    const s0 = at(s, grid[0]), e0 = at(e, grid[0]);
    return { t: grid, S: grid.map((ts) => (100 * at(s, ts)) / s0), E: grid.map((ts) => (100 * at(e, ts)) / e0) };
  }, [px]);
  const src = useMemo(() => live ?? (px.state === "loading" ? null : { t: null, S: BREADTH.S, E: BREADTH.E }), [live, px.state]);

  const d = useMemo(() => {
    if (!src) return null;
    const { S, E } = src, n = S.length, all = S.concat(E), lo = Math.min(...all, 100), hi = Math.max(...all);
    const y = (v: number) => 12 + (1 - (v - lo) / (hi - lo)) * 256, x = (i: number) => ((i / (n - 1)) * 1000).toFixed(1);
    const ln = (A: number[]) => "M" + A.map((v, i) => `${x(i)},${y(v).toFixed(1)}`).join(" L");
    const spread = ln(S) + " L" + E.slice().reverse().map((v, k) => `${x(n - 1 - k)},${y(v).toFixed(1)}`).join(" L") + " Z";
    const pct = (v: number) => ((y(v) / 280) * 100).toFixed(2) + "%";
    const sr = S[n - 1] - 100, er = E[n - 1] - 100, sp = sr - er;
    const yrs = src.t ? (src.t[n - 1] - src.t[0]) / (365.25 * DAY) : null;
    const per = yrs ? `${yrs.toFixed(1)}Y` : "PERIOD";
    const ticks = src.t ? (() => {
      const out: { l: string; x: number }[] = [];
      const t = src.t, f = new Date(t[0] * 1000).getUTCFullYear(), l = new Date(t[n - 1] * 1000).getUTCFullYear();
      for (let yy = f + 1; yy <= l; yy++) { const ts = Date.UTC(yy, 0, 1) / 1000; out.push({ l: String(yy), x: ((ts - t[0]) / (t[n - 1] - t[0])) * 100 }); }
      return out;
    })() : [];
    return {
      cap: ln(S), eq: ln(E), spread, baseY: y(100).toFixed(1), baseTop: pct(100), capTop: pct(S[n - 1]), eqTop: pct(E[n - 1]),
      capEnd: S[n - 1].toFixed(0), eqEnd: E[n - 1].toFixed(0), ticks,
      stats: [
        { l: `CAP-WEIGHT ${per}`, v: sg1(sr) + "%", c: "#34D399" }, { l: `EQUAL-WEIGHT ${per}`, v: sg1(er) + "%", c: "#22D3EE" },
        { l: "SPREAD", v: sg1(sp) + " pp", c: "#FFFFFF" },
        { l: "BREADTH REGIME", v: sp > 25 ? "▲ NARROW" : "BROAD", c: sp > 25 ? "#FF4D4D" : "#4ADE80" },
      ],
    };
  }, [src]);

  return (
    <div className={`flex flex-col font-mono tabular-nums ${CARD}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/[0.06] px-[18px] py-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-bold tracking-[0.1em] text-neutral-200">[ S&amp;P 500: MARKET-CAP vs. EQUAL-WEIGHT SPREAD ]</span>
          <span title="Market breadth: when cap-weighted (SPY) outruns equal-weighted (RSP), gains are concentrated in a few mega-caps. A widening spread = narrow participation; a shrinking spread = healthy, broad rally." className="flex h-5 cursor-help items-center gap-[5px] border border-gray-800 px-[7px] text-[9.5px] font-bold tracking-[0.1em] text-gray-400 hover:border-gray-700 hover:text-white">ⓘ MARKET BREADTH</span>
          {src && !live && <ModelBadge why={`Live SPY / RSP prices could not be loaded (${px.state === "error" ? "request failed" : "no data"}) — showing an illustrative model series.`} />}
        </div>
        <div className="flex items-center gap-4 whitespace-nowrap text-[10px] tracking-[0.08em] text-gray-400">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 bg-emerald-400" />CAP-WEIGHT · SPY</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 bg-cyan-400" />EQUAL-WEIGHT · RSP</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 border border-emerald-400/30 bg-emerald-400/[0.14]" />SPREAD</span>
        </div>
      </div>
      {!d ? <div className="p-4"><DataState state="loading" label="SPY / RSP" h={280} /></div> : (
        <>
          <div className="relative ml-[18px] mr-[70px] mt-4 h-[280px]">
            <svg viewBox="0 0 1000 280" preserveAspectRatio="none" className="absolute inset-0 block h-full w-full overflow-visible">
              <defs>
                <linearGradient id="cSpread" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#34D399" stopOpacity="0.02" />
                  <stop offset="1" stopColor="#34D399" stopOpacity="0.2" />
                </linearGradient>
              </defs>
              <line x1="0" x2="1000" y1={d.baseY} y2={d.baseY} stroke="#1F2937" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
              <path d={d.spread} fill="url(#cSpread)" stroke="none" />
              <path d={d.eq} fill="none" stroke="#22D3EE" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              <path d={d.cap} fill="none" stroke="#34D399" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
            <span className="absolute right-0 mt-[3px] text-[9px] text-gray-600" style={{ top: d.baseTop }}>BASE 100</span>
            <span className="absolute left-full -mt-[9px] ml-2 bg-emerald-400 px-[5px] py-px text-[10px] font-bold text-black" style={{ top: d.capTop }}>{d.capEnd}</span>
            <span className="absolute left-full -mt-[9px] ml-2 bg-cyan-400 px-[5px] py-px text-[10px] font-bold text-black" style={{ top: d.eqTop }}>{d.eqEnd}</span>
          </div>
          <div className="relative ml-[18px] mr-[70px] h-7 pb-3 pt-2 text-[9.5px] tracking-[0.08em] text-gray-600">
            {d.ticks.map((tk) => <span key={tk.l} className="absolute -translate-x-1/2" style={{ left: `${tk.x}%` }}>{tk.l}</span>)}
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] border-t border-white/[0.06]">
            {d.stats.map((st) => (
              <div key={st.l} className="flex min-w-0 flex-col gap-[5px] border-l border-gray-900 px-[18px] py-3">
                <span className="whitespace-nowrap text-[9px] font-bold tracking-[0.16em] text-gray-500">{st.l}</span>
                <span className="whitespace-nowrap text-sm font-semibold" style={{ color: st.c }}>{st.v}</span>
              </div>
            ))}
          </div>
          <span className="px-[18px] pb-2.5 text-[9.5px] tracking-[0.08em] text-zinc-600">BOTH SERIES REBASED TO 100 AT THE FIRST COMMON WEEK · WEEKLY CLOSES · PRICE RETURN</span>
        </>
      )}
    </div>
  );
}

/* ── Tab ───────────────────────────────────────────────────── */

/** `main` = the analysed line (default: the ETF itself; the portfolio passes its basket). */
export default function ChartsTab({ fund, main: mainProp }: { fund: FundData; main?: MainDef }) {
  const [group, setGroup] = usePersisted<Group>("oasis.charts.group.v1", DEFAULT_GROUP);
  const main = useMemo<MainDef>(() => mainProp ?? { id: fund.tic, label: fund.tic, sym: fund.tic, color: "#f87171" }, [mainProp, fund.tic]);
  const g = GROUPS.find(([k]) => k === group) ?? GROUPS[0];
  return (
    <div className="flex min-w-0 flex-none flex-col gap-3 px-3 pb-8 pt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="tablist" aria-label="Analysis" className="flex flex-wrap rounded-sm border border-white/[0.06] bg-[var(--oasis-panel)] p-0.5">
          {GROUPS.map(([k, l, hint]) => (
            <button key={k} type="button" role="tab" aria-selected={group === k} title={hint} onClick={() => setGroup(k)}
              className={`h-7 rounded-sm px-3 font-mono text-[11px] font-bold tracking-[0.1em] ${group === k ? "oasis-on" : "text-zinc-500 hover:text-zinc-200"}`}>{l}</button>
          ))}
        </div>
        <span className="font-mono text-[10.5px] text-zinc-500">{g[2]}</span>
      </div>
      {g[0] === "PERF" && <Performance fund={fund} main={main} />}
      {g[0] === "RISK" && <RiskDrawdown fund={fund} main={main} />}
      {g[0] === "ANNUAL" && <AnnualMonthly fund={fund} main={main} />}
      {g[0] === "INCOME" && <Income fund={fund} />}
      {g[0] === "MARKET" && <BreadthChart />}
    </div>
  );
}
