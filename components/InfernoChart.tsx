"use client";

/* ─────────────────────────────────────────────────────────────
   INFERNO CHART — one chart for the whole terminal (portfolio deep view, ETF deep view, scanner cockpit).
   · Timeframe rail (1D → MAX; 3Y / 5Y / MAX load weekly / monthly history, the rest daily). Picking a stop zooms the chart to that window;
     scrolling / zooming the chart moves the rail thumb to the matching position (e.g. two months
     sits between 1M and 3M). Daily history is loaded for 2 years, so scrolling back shows real
     earlier months instead of an empty gap; both edges are pinned (no holes left or right).
   · % scale = change from the first visible bar, for every line (re-bases as you scroll).
   · LINE / AREA for the main series; CANDLE only when the feed returns genuine OHLC bars.
   · Timeframes longer than the instrument's real history are disabled (MAX = earliest observation).
   · Ctrl (⌘) + drag on the chart = measurement: blue line, % change between the two closes, both dates.
   · Legend: main line, pinned comparisons (S&P 500, top-5 holdings) — click to grey out / bring back;
     [ + COMPARE ASSET ] = autocomplete over the instrument catalog; adding one rebases every line to 100.
   Prices: /api/prices (Yahoo). Falls back to labelled model data.
   ───────────────────────────────────────────────────────────── */

import {
  AreaSeries, CandlestickSeries, ColorType, CrosshairMode, LineSeries, LineStyle, PriceScaleMode, createChart,
  type IChartApi, type ISeriesApi, type SeriesType, type Time, type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { searchCatalog } from "@/lib/catalog";
import { useCtrlMeasure } from "@/lib/useCtrlMeasure";

export type ChartTf = "MAX" | "5Y" | "3Y" | "1Y" | "YTD" | "6M" | "3M" | "1M" | "1W" | "1D";
/** shortest → longest, left → right — the standard rail everywhere */
export const CHART_TFS: ChartTf[] = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "MAX"];

export type Raw = { t: number[]; c: number[]; o?: number[]; h?: number[]; l?: number[] };
export interface LineDef { id: string; label: string; sym: string; color: string; dashed?: boolean }
export interface MainDef {
  id: string; label: string; color: string;
  /** a single instrument … */
  sym?: string;
  /** … or a weighted basket (portfolio) built from these instruments */
  basket?: { sym: string; weight: number }[];
}

const MONO = "font-mono";
type Unit = "PRICE" | "PCT" | "IDX";
type Kind = "LINE" | "AREA" | "CANDLE";
const DAY = 86400;
const EXTRA_COLORS = ["#f472b6", "#22d3ee", "#facc15", "#a78bfa", "#fb923c", "#4ade80", "#38bdf8", "#e879f9"];
const rangeOf = (tf: ChartTf) => (tf === "1D" ? "1d" : tf === "1W" ? "5d" : tf === "3Y" || tf === "5Y" ? "5y" : tf === "MAX" ? "max" : "2y");
const ytdDays = () => { const n = new Date(); return Math.max(1, (n.getTime() - Date.UTC(n.getUTCFullYear(), 0, 1)) / 864e5); };
const spanOf = (tf: ChartTf) => ({ MAX: Infinity, "5Y": 1826, "3Y": 1096, "1Y": 365, YTD: ytdDays(), "6M": 182, "3M": 91, "1M": 30, "1W": 7, "1D": 1 })[tf];
/** windows that always show the whole loaded series */
const WHOLE = (tf: ChartTf) => tf === "1D" || tf === "1W" || tf === "MAX";
const sgn = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "%";

/** Rail position (index into `items`, fractional) for a visible span in days — log-interpolated between stops. */
function posOf(spanDays: number, items: readonly ChartTf[]): number {
  const stops = items.map((t, i) => [i, spanOf(t)] as const).filter(([, d]) => Number.isFinite(d)).reverse();
  if (!stops.length) return 0;
  if (spanDays >= stops[0][1]) return stops[0][0];
  for (let k = 0; k < stops.length - 1; k++) {
    const [ia, a] = stops[k], [ib, b] = stops[k + 1];
    if (spanDays <= a && spanDays >= b && a !== b) return ia - (ia - ib) * (Math.log(a / spanDays) / Math.log(a / b));
  }
  return stops[stops.length - 1][0];
}

/* ── live window statistics (from the loaded closes; price return, no distributions) ── */
interface WinStats { ret: number; cagr: number | null; maxDD: number; vol: number | null }
function windowStats(s: Raw, from: number, to: number, intraday: boolean): WinStats | null {
  const idx: number[] = [];
  for (let i = 0; i < s.t.length; i++) if (s.t[i] >= from && s.t[i] <= to) idx.push(i);
  if (idx.length < 3) return null;
  const c = idx.map((i) => s.c[i]), t = idx.map((i) => s.t[i]);
  const ret = (c[c.length - 1] / c[0] - 1) * 100;
  let peak = c[0], dd = 0;
  for (const v of c) { if (v > peak) peak = v; dd = Math.min(dd, v / peak - 1); }
  const years = (t[t.length - 1] - t[0]) / (365.25 * DAY);
  let vol: number | null = null;
  if (!intraday) {
    const r = c.slice(1).map((v, i) => Math.log(v / c[i]));
    const m = r.reduce((a, x) => a + x, 0) / r.length;
    const sd = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, r.length - 1));
    const gaps = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b);
    const perYear = (365.25 * DAY) / gaps[Math.floor(gaps.length / 2)];
    // daily bars trade ~252 days a year, not 365 — trading-day annualisation for daily data
    vol = sd * Math.sqrt(perYear > 300 ? 252 : perYear) * 100;
  }
  const cagr = !intraday && years >= 0.98 ? (Math.pow(c[c.length - 1] / c[0], 1 / years) - 1) * 100 : null;
  return { ret, cagr, maxDD: dd * 100, vol };
}

/** Deterministic stand-in when Yahoo is unreachable */
function model(sym: string, range: string): Raw {
  const step = range === "1d" ? 300 : range === "5d" ? 1800 : DAY;
  const n = range === "1d" ? 78 : range === "5d" ? 65 : 504;
  let h = 0;
  for (const ch of sym + range) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
  const end = Math.floor(Date.now() / 1000 / step) * step;
  let p = 100;
  const t: number[] = [], c: number[] = [];
  for (let i = 0; i < n; i++) { t.push(end - (n - 1 - i) * step); p *= 1 + (rnd() - 0.48) * (step === DAY ? 0.018 : 0.003); c.push(p); }
  return { t, c };
}

/** value of s at time t (last close at or before t; first close before the series starts) */
export function at(s: Raw, t: number) {
  if (t <= s.t[0]) return s.c[0];
  let lo = 0, hi = s.t.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s.t[m] <= t) lo = m; else hi = m - 1; }
  return s.c[lo];
}

export function basketSeries(parts: { s: Raw; w: number }[]): Raw | null {
  const ok = parts.filter((p) => p.s && p.s.c.length > 1);
  if (!ok.length) return null;
  const grid = ok.reduce((a, p) => (p.s.t.length > a.length ? p.s.t : a), [] as number[]);
  const W = ok.reduce((a, p) => a + p.w, 0) || 1;
  return { t: grid, c: grid.map((t) => 100 * ok.reduce((a, p) => a + (p.w / W) * (at(p.s, t) / at(p.s, grid[0])), 0)) };
}

/** Segmented light-blue rail: a wide rounded rectangle split into cells; the glowing block slides along it —
 *  snapped on a pick, fractional while a chart scrolls/zooms (`pos`). Used by every chart and the market map. */
export function SegRail<T extends string>({ items, value, pos, onChange, width = 360, disabled }: { items: readonly T[]; value: T; pos?: number; onChange: (t: T) => void; width?: number; /** stops that can't be picked (e.g. longer than the data history) */ disabled?: ReadonlySet<T> }) {
  const ref = useRef<HTMLDivElement>(null);
  const n = items.length;
  const idx = items.indexOf(value);
  const p = Math.min(n - 1, Math.max(0, pos ?? idx));
  const pick = (x: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const t = items[Math.min(n - 1, Math.max(0, Math.floor(((x - r.left) / r.width) * n)))];
    if (!disabled?.has(t)) onChange(t);
  };
  const step = (d: 1 | -1) => { for (let i = idx + d; i >= 0 && i < n; i += d) if (!disabled?.has(items[i])) return onChange(items[i]); };
  return (
    <div ref={ref} role="slider" tabIndex={0} aria-label="Timeframe" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={n - 1} aria-valuenow={idx} aria-valuetext={value}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); step(1); }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); step(-1); }
      }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientX); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX); }}
      style={{ width }}
      className="relative flex h-[30px] max-w-full flex-none cursor-ew-resize touch-none select-none overflow-hidden rounded-sm border border-oasis/25 bg-[var(--oasis-bg)] outline-none focus-visible:ring-1 focus-visible:ring-oasis/40">
      <span className="pointer-events-none absolute inset-y-[2px] rounded-xs border border-oasis/80 bg-oasis/20 shadow-[0_0_5px_color-mix(in_srgb,var(--oasis-accent)_25%,transparent)] transition-[left] duration-150 ease-out"
        style={{ left: `calc(${(p / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }} />
      {items.map((t, i) => (
        <span key={t} title={disabled?.has(t) ? `${t}: longer than the available price history` : undefined}
          className={`relative z-[1] flex flex-1 items-center justify-center ${i ? "border-l border-oasis/10" : ""} ${MONO} text-[10.5px] font-bold tracking-[0.06em] ${i === idx ? "text-oasis" : disabled?.has(t) ? "cursor-not-allowed text-zinc-700 line-through decoration-zinc-700" : "text-zinc-500"}`}>{t}</span>
      ))}
    </div>
  );
}

export function TfRail({ value, pos, onChange }: { value: ChartTf; pos?: number; onChange: (t: ChartTf) => void }) {
  return <SegRail items={CHART_TFS} value={value} pos={pos} onChange={onChange} width={CHART_TFS.length * 44} />;
}

const STAT_INFO = {
  ret: "Price change from the first to the last bar of the visible window. Price return — excludes distributions.",
  cagr: "Compound annual growth rate over the visible window (price only). Shown for windows of about 1 year or longer.",
  dd: "Largest peak-to-trough fall within the visible window, from closing prices.",
  vol: "Annualised standard deviation of bar-to-bar log returns within the visible window (daily bars: ×√252).",
};

/** "#60a5fa" → "rgba(96,165,250,a)" — comparison lines are drawn muted so the main line dominates */
const mute = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

export default function InfernoChart({ main, pinned: pinnedAll = [], picker = [], tf: tfProp, onTfChange, initialTf = "1Y", className = "", groupLabel = "TOP 5 HOLDINGS", valueScale, unitLabel = "PRICE", tfs = CHART_TFS, initialUnit = "PRICE", stats = false }: {
  /** timeframes offered on the rail (default: every stop 1D → MAX) */
  tfs?: readonly ChartTf[];
  /** right axis on first render: price / value, % or base 100 (every line rebased to its first visible bar) */
  initialUnit?: Unit;
  /** show return / CAGR / max drawdown / volatility of the main line over the visible window */
  stats?: boolean;
  /** basket only: today's value (e.g. portfolio $) — PRICE mode then plots the basket in money, not an index */
  valueScale?: number;
  /** label for the price-mode button ("PRICE", "VALUE") */
  unitLabel?: string;
  /** label of the button that reveals the grouped comparisons (ids "top:…" / "peer:…") */
  groupLabel?: string;
  main: MainDef;
  /** always-listed comparisons (S&P 500, top-5 holdings): click greys them out */
  pinned?: LineDef[];
  /** instruments offered under [ + ] (e.g. every holding) */
  picker?: { sym: string; label: string; sub?: string }[];
  tf?: ChartTf;
  onTfChange?: (t: ChartTf) => void;
  initialTf?: ChartTf;
  className?: string;
}) {
  const [tfLocal, setTfLocal] = useState<ChartTf>(initialTf);
  const tf = tfProp ?? tfLocal;
  const setTf = (t: ChartTf) => { setTfLocal(t); onTfChange?.(t); };
  const [kindPick, setKind] = useState<Kind>("LINE");
  /** right axis: real price / value, % change, or indexed to 100 — the last two rebase at the first visible bar */
  const [unit, setUnit] = useState<Unit>(initialUnit);
  const [hit, setHit] = useState(0); // autocomplete: highlighted row
  const listId = useId();
  const [off, setOff] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<LineDef[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [q, setQ] = useState("");
  const [vis, setVis] = useState<{ from: number; to: number } | null>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);

  const range = rangeOf(tf);
  /* Only the main line + S&P 500 at first; the grouped comparisons (top-5 holdings / peers) appear on demand */
  const [showGroup, setShowGroup] = useState(false);
  const isGroup = (id: string) => id.startsWith("top:") || id.startsWith("peer:");
  const hasGroup = pinnedAll.some((l) => isGroup(l.id));
  const pinned = useMemo(() => (showGroup ? pinnedAll : pinnedAll.filter((l) => !isGroup(l.id))), [pinnedAll, showGroup]);
  const lines = useMemo(() => [...pinned, ...extras.filter((e) => !pinned.some((p) => p.sym === e.sym))], [pinned, extras]);
  const syms = useMemo(() => [...new Set([...(main.sym ? [main.sym] : []), ...(main.basket ?? []).map((b) => b.sym), ...lines.map((l) => l.sym)])].sort(), [main, lines]);
  const key = `${range}|${syms.join(",")}`;

  /* ── data ── */
  const [data, setData] = useState<{ key: string; raw: Record<string, Raw>; model: boolean } | null>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      const got: Record<string, Raw | null> = {};
      for (let i = 0; i < syms.length; i += 20) {
        try {
          const j = await fetch(`/api/prices?symbols=${encodeURIComponent(syms.slice(i, i + 20).join(","))}&range=${range}`).then((r) => r.json());
          Object.assign(got, j.series ?? {});
        } catch { /* offline */ }
      }
      let isModel = false;
      const raw: Record<string, Raw> = {};
      for (const s of syms) { const v = got[s]; if (v && v.c.length > 1) raw[s] = v; else { raw[s] = model(s, range); isModel = true; } }
      if (!dead) setData((d) => (d?.key === key ? d : { key, raw, model: isModel }));
    })();
    return () => { dead = true; };
  }, [key, range, syms]);

  const ready = data?.key === key ? data : null;

  /* ── history bounds: the earliest observation (monthly MAX series) → timeframes beyond it are disabled ── */
  const mainSyms = useMemo(() => (main.sym ? [main.sym] : (main.basket ?? []).map((b) => b.sym)), [main]);
  const histKey = mainSyms.join(",");
  const [hist, setHist] = useState<{ key: string; first: number | null; at: number } | null>(null);
  useEffect(() => {
    if (!histKey) return;
    let dead = false;
    fetch(`/api/prices?symbols=${encodeURIComponent(histKey)}&range=max`).then((r) => r.json())
      .then((j: { series?: Record<string, Raw | null> }) => {
        const firsts = histKey.split(",").map((s) => j.series?.[s.toUpperCase()]?.t[0]).filter((t): t is number => typeof t === "number");
        // a basket only has full history from its youngest member on
        if (!dead) setHist({ key: histKey, first: firsts.length ? Math.max(...firsts) : null, at: Date.now() / 1000 });
      })
      .catch(() => { if (!dead) setHist({ key: histKey, first: null, at: 0 }); });
    return () => { dead = true; };
  }, [histKey]);
  const firstObs = hist?.key === histKey ? hist.first : null;
  const histAt = hist?.at ?? 0;
  const disabledTfs = useMemo(() => {
    const out = new Set<ChartTf>();
    if (firstObs == null) return out;
    const now = histAt;
    for (const t of tfs) if (!WHOLE(t) && t !== "YTD" && firstObs > now - spanOf(t) * DAY + 7 * DAY) out.add(t);
    return out;
  }, [firstObs, histAt, tfs]);
  const mainRaw = useMemo(() => {
    if (!ready) return null;
    if (main.sym) return ready.raw[main.sym] ?? null;
    return basketSeries((main.basket ?? []).map((b) => ({ s: ready.raw[b.sym], w: b.weight })));
  }, [ready, main]);

  /* ── chart ── */
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const series = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());
  const fitTo = useRef<ChartTf | null>(tf);
  const [api, setApi] = useState<IChartApi | null>(null);
  const [mainSeries, setMainSeries] = useState<ISeriesApi<SeriesType> | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#71717a", fontFamily: "'Geist Mono Variable', ui-monospace, monospace", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: "rgba(255,255,255,0.025)" }, horzLines: { color: "rgba(255,255,255,0.035)" } },
      // tight vertical fit: autoscale to the visible window of the visible lines, small margins
      rightPriceScale: { borderColor: "rgba(255,255,255,0.05)", mode: PriceScaleMode.Percentage, autoScale: true, scaleMargins: { top: 0.06, bottom: 0.06 } },
      timeScale: { borderColor: "rgba(255,255,255,0.05)", timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true, rightOffset: 0 },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "rgba(255,255,255,0.2)", style: LineStyle.Dashed, labelBackgroundColor: "#27272a" }, horzLine: { color: "rgba(255,255,255,0.2)", style: LineStyle.Dashed, labelBackgroundColor: "#27272a" } },
    });
    chartRef.current = chart;
    queueMicrotask(() => setApi(chart));
    chart.timeScale().subscribeVisibleTimeRangeChange((r) => { if (r) setVis({ from: r.from as number, to: r.to as number }); });
    chart.subscribeCrosshairMove((p) => setHoverT(typeof p.time === "number" ? p.time : null));
    const map = series.current;
    return () => { chart.remove(); chartRef.current = null; map.clear(); setApi(null); setMainSeries(null); };
  }, []);

  // (re)draw all series
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ready || !mainRaw) return;
    const map = series.current;
    const want = new Set<string>();
    const dedupe = <T,>(t: number[], f: (i: number) => T) => {
      const m = new Map<number, T>();
      t.forEach((ts, i) => m.set(ts, f(i)));
      return [...m].sort((a, b) => a[0] - b[0]);
    };
    // main — candles only on genuine OHLC bars (never synthesised from closes)
    const kind: Kind = kindPick === "CANDLE" && !(mainRaw.o && mainRaw.h && mainRaw.l) ? "LINE" : kindPick;
    const mainKey = `main:${kind}`;
    want.add(mainKey);
    let ms = map.get(mainKey);
    if (!ms) {
      ms = kind === "CANDLE"
        ? chart.addSeries(CandlestickSeries, { upColor: "#34d399", downColor: "#f87171", borderVisible: false, wickUpColor: "#34d399", wickDownColor: "#f87171", priceLineVisible: false, lastValueVisible: false, title: "" })
        : kind === "AREA"
        ? chart.addSeries(AreaSeries, { lineColor: main.color, lineWidth: 2, topColor: mute(main.color, 0.28), bottomColor: mute(main.color, 0), priceLineVisible: false, lastValueVisible: false, title: "" })
        : chart.addSeries(LineSeries, { color: main.color, lineWidth: 3, priceLineVisible: false, lastValueVisible: false, title: "" });
      map.set(mainKey, ms);
      const created = ms;
      queueMicrotask(() => setMainSeries(created));
    }
    chart.applyOptions({ rightPriceScale: { mode: unit === "PCT" ? PriceScaleMode.Percentage : unit === "IDX" ? PriceScaleMode.IndexedTo100 : PriceScaleMode.Normal } });
    // PRICE mode: basket scaled to today's money value; comparisons rebased onto the main line's starting level
    const k0 = unit === "PRICE" && valueScale && mainRaw.c.length ? valueScale / mainRaw.c[mainRaw.c.length - 1] : 1;
    const r = k0 === 1 ? mainRaw : { ...mainRaw, c: mainRaw.c.map((v) => v * k0), o: mainRaw.o?.map((v) => v * k0), h: mainRaw.h?.map((v) => v * k0), l: mainRaw.l?.map((v) => v * k0) };
    if (kind === "CANDLE") {
      ms.setData(dedupe(r.t, (i) => ({ o: r.o![i], h: r.h![i], l: r.l![i], c: r.c[i] }))
        .map(([t, v]) => ({ time: t as UTCTimestamp, open: v.o, high: v.h, low: v.l, close: v.c })));
    } else {
      ms.setData(dedupe(r.t, (i) => r.c[i]).map(([t, value]) => ({ time: t as UTCTimestamp, value })));
    }
    ms.applyOptions({ visible: !off.has(main.id) });
    // current price: plain white number on the right axis — no coloured box covering the line
    const last = r.c[r.c.length - 1];
    const old = (ms as unknown as { __pl?: ReturnType<typeof ms.createPriceLine> }).__pl;
    if (old) ms.removePriceLine(old);
    if (Number.isFinite(last)) {
      (ms as unknown as { __pl?: ReturnType<typeof ms.createPriceLine> }).__pl = ms.createPriceLine({
        price: last, lineVisible: false, axisLabelVisible: true, axisLabelColor: "rgba(0,0,0,0)", axisLabelTextColor: "#ffffff", title: "",
      });
    }
    // comparisons
    for (const l of lines) {
      const s = ready.raw[l.sym];
      if (!s) continue;
      const k = `l:${l.id}`;
      want.add(k);
      let ls = map.get(k);
      if (!ls) {
        ls = chart.addSeries(LineSeries, { color: mute(l.color, l.dashed ? 0.55 : 0.45), lineWidth: 1, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, title: "" });
        map.set(k, ls);
      }
      const kk = unit === "PRICE" ? r.c[0] / (at(s, r.t[0]) || 1) : 1;
      ls.setData(dedupe(s.t, (i) => s.c[i] * kk).map(([t, value]) => ({ time: t as UTCTimestamp, value })));
      ls.applyOptions({ visible: !off.has(l.id) });
    }
    for (const [k, s] of map) if (!want.has(k)) { chart.removeSeries(s); map.delete(k); }
    // zoom to the picked timeframe once per pick / data load
    if (fitTo.current) {
      const end = r.t[r.t.length - 1];
      const from = WHOLE(fitTo.current) ? r.t[0] : end - spanOf(fitTo.current) * DAY;
      chart.timeScale().setVisibleRange({ from: Math.max(r.t[0], from) as Time, to: end as Time });
      fitTo.current = null;
    }
  }, [ready, mainRaw, lines, kindPick, off, main.id, main.label, main.color, unit, valueScale]);

  const pick = (t: ChartTf) => { fitTo.current = t; setTf(t); };
  // timeframe changed from outside (controlled `tf`, e.g. the Composition Map period) → zoom to it as well
  useEffect(() => { fitTo.current = tf; }, [tf]);
  // same data range (e.g. 1M → 3M on the 2-year daily set): just zoom, no reload
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mainRaw || !fitTo.current || rangeOf(fitTo.current) !== range) return;
    const end = mainRaw.t[mainRaw.t.length - 1];
    const from = WHOLE(fitTo.current) ? mainRaw.t[0] : end - spanOf(fitTo.current) * DAY;
    chart.timeScale().setVisibleRange({ from: Math.max(mainRaw.t[0], from) as Time, to: end as Time });
    fitTo.current = null;
  }, [tf, range, mainRaw]);

  /* ── legend values: change over the visible window (or up to the crosshair) ── */
  const pctOver = (s: Raw | null | undefined) => {
    if (!s || !vis) return null;
    const a = at(s, vis.from), b = at(s, hoverT ?? vis.to);
    return a ? (b / a - 1) * 100 : null;
  };
  const span = vis ? (vis.to - vis.from) / DAY : spanOf(tf);
  const pos = WHOLE(tf) ? tfs.indexOf(tf) : posOf(span, tfs);
  /* the instrument's history is shorter than the picked window (young fund / limited data) */
  const shortHistory = mainRaw && !WHOLE(tf) && mainRaw.t[0] > mainRaw.t[mainRaw.t.length - 1] - spanOf(tf) * DAY + 7 * DAY
    ? new Date(mainRaw.t[0] * 1000).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase() : null;
  const win = stats && mainRaw && vis && !ready?.model ? windowStats(mainRaw, vis.from, vis.to, tf === "1D" || tf === "1W") : null;

  const toggle = (id: string) => setOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const addExtra = (sym: string, label = sym) => {
    if (main.sym === sym || lines.some((l) => l.sym === sym)) return;
    // distinct colour: first palette colour not already on the chart
    setExtras((e) => {
      const used = new Set([main.color, ...lines.map((l) => l.color), ...e.map((x) => x.color)]);
      return [...e, { id: `x:${sym}`, label, sym, color: EXTRA_COLORS.find((c) => !used.has(c)) ?? EXTRA_COLORS[e.length % EXTRA_COLORS.length] }];
    });
    // several instruments → compare them on a common base (100 at the first visible bar)
    setUnit("IDX");
    setQ(""); setHit(0);
  };
  const needle = q.trim().toUpperCase();
  const found = needle
    ? [...picker.filter((p) => p.sym.includes(needle) || p.label.toUpperCase().includes(needle)),
       ...searchCatalog(needle, 14).map((i) => ({ sym: i.sym, label: i.label, sub: `${i.kind} · ${i.name}` }))]
        .filter((x, i, a) => a.findIndex((y) => y.sym === x.sym) === i).slice(0, 14)
    : picker;

  /* ── Ctrl + drag measurement (shared hook; T = index into the main series) ── */
  const nearest = (t: number) => {
    const ts = mainRaw?.t ?? [];
    let lo = 0, hi = ts.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m] < t) lo = m + 1; else hi = m; }
    return lo > 0 && Math.abs(ts[lo - 1] - t) < Math.abs(ts[lo] - t) ? lo - 1 : lo;
  };
  const measure = useCtrlMeasure<number>((e) => {
    if (!api || !mainRaw?.t.length) return null;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const t = api.timeScale().coordinateToTime(x);
    return typeof t === "number" ? nearest(t) : null;
  });
  const mSpan = measure.span && mainRaw && measure.span.a < mainRaw.t.length && measure.span.b < mainRaw.t.length ? measure.span : null;
  const mGeo = (() => {
    if (!mSpan || !mainRaw || !api || !mainSeries) return null;
    const [ia, ib] = mSpan.a <= mSpan.b ? [mSpan.a, mSpan.b] : [mSpan.b, mSpan.a];
    // y from the values actually plotted (PRICE mode may scale a basket to money); % from the raw closes
    const k0 = unit === "PRICE" && valueScale && mainRaw.c.length ? valueScale / mainRaw.c[mainRaw.c.length - 1] : 1;
    const xy = (i: number) => ({ x: api.timeScale().timeToCoordinate(mainRaw.t[i] as Time), y: mainSeries.priceToCoordinate(mainRaw.c[i] * k0) });
    const A = xy(ia), B = xy(ib);
    if (A.x == null || B.x == null || A.y == null || B.y == null) return null;
    const pct = ((mainRaw.c[ib] - mainRaw.c[ia]) / mainRaw.c[ia]) * 100;
    const intraday = tf === "1D" || tf === "1W";
    const fmt = (t: number) => new Date(t * 1000).toLocaleString("en-US", intraday ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).toUpperCase();
    return { A: { x: A.x, y: A.y }, B: { x: B.x, y: B.y }, pct, from: fmt(mainRaw.t[ia]), to: fmt(mainRaw.t[ib]), bars: ib - ia };
  })();
  const hasOhlc = !!(mainRaw?.o && mainRaw.h && mainRaw.l);
  const kindShown: Kind = kindPick === "CANDLE" && !hasOhlc ? "LINE" : kindPick;

  const chip = (id: string, label: string, color: string, dashed: boolean | undefined, v: number | null, removable: boolean) => {
    const dim = off.has(id);
    return (
      <button key={id} type="button" onClick={() => (removable ? setExtras((e) => e.filter((x) => x.id !== id)) : toggle(id))}
        title={removable ? "Click to remove" : dim ? "Click to show" : "Click to hide"}
        className={`flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 transition-colors hover:bg-white/[0.05] ${dim ? "opacity-35" : ""}`}>
        <span className="w-4 flex-none" style={dashed ? { borderTop: `1px dashed ${color}` } : { height: 2, background: color }} />
        <span className={dim ? "text-zinc-500" : "text-zinc-200"}>{label}</span>
        {v != null && !dim && <span className={v >= 0 ? "text-emerald-400" : "text-rose-400"}>{sgn(v)}</span>}
        {removable && <span className="text-zinc-600">×</span>}
      </button>
    );
  };

  return (
    <div className={`flex h-full min-h-0 flex-col gap-2 ${className}`}>
      {/* legend + controls */}
      <div className={`${MONO} flex flex-wrap items-center gap-x-1 gap-y-1 text-[10.5px] tabular-nums`}>
        {chip(main.id, main.label, main.color, false, pctOver(mainRaw), false)}
        {pinned.filter((l) => !isGroup(l.id)).map((l) => chip(l.id, l.label, l.color, l.dashed, pctOver(ready?.raw[l.sym]), false))}
        {hasGroup && (
          <button type="button" onClick={() => setShowGroup((v) => !v)} aria-pressed={showGroup}
            className={`mx-1 h-5 rounded-sm border px-2 text-[9.5px] font-bold tracking-[0.08em] transition-colors ${showGroup ? "border-oasis/50 bg-oasis-muted text-oasis" : "border-white/[0.12] text-zinc-400 hover:border-white/[0.3] hover:text-white"}`}>
            {showGroup ? `HIDE ${groupLabel}` : `SHOW ${groupLabel}`}
          </button>
        )}
        {pinned.filter((l) => isGroup(l.id)).map((l) => chip(l.id, l.label, l.color, l.dashed, pctOver(ready?.raw[l.sym]), false))}
        {extras.map((l) => chip(l.id, l.label, l.color, false, pctOver(ready?.raw[l.sym]), true))}
        <button type="button" onClick={() => setPickOpen((o) => !o)} aria-expanded={pickOpen} title="Overlay another instrument — all lines are rebased to 100"
          className={`ml-1 flex h-5 items-center rounded-sm border px-2 text-[9.5px] font-bold tracking-[0.08em] transition-colors ${pickOpen ? "border-oasis/50 bg-oasis-muted text-oasis" : "border-white/[0.12] text-zinc-400 hover:border-white/[0.3] hover:text-white"}`}>+ COMPARE ASSET</button>
        <span className="ml-auto flex items-center gap-2">
          {shortHistory && <span className="rounded-sm bg-white/[0.05] px-1.5 py-px text-[9.5px] font-bold tracking-[0.1em] text-zinc-400" title={`Price history only starts in ${shortHistory} — the chart shows everything available`}>HISTORY FROM {shortHistory}</span>}
          {ready?.model && <span className="rounded-sm bg-amber-400/10 px-1.5 py-px text-[9.5px] font-bold tracking-[0.1em] text-amber-300" title="Live prices could not be loaded (offline, blocked or unknown symbol) — the lines are synthetic placeholders">MODEL DATA</span>}
          <span className="flex rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] p-0.5" title="Right axis: price / value · % change · indexed to 100 (both rebased at the first visible bar)">
            {(["PRICE", "PCT", "IDX"] as const).map((u) => (
              <button key={u} type="button" onClick={() => setUnit(u)} aria-pressed={unit === u}
                className={`h-5 rounded-sm px-2 text-[9.5px] font-bold tracking-[0.08em] ${unit === u ? "oasis-on" : "text-zinc-500 hover:text-zinc-200"}`}>{u === "PRICE" ? (valueScale ? "$ VALUE" : unitLabel) : u === "PCT" ? "%" : "100"}</button>
            ))}
          </span>
          <span className="flex rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] p-0.5" title={hasOhlc ? "Chart type" : "Candles need open/high/low data — not available for this series"}>
            {(hasOhlc ? (["LINE", "AREA", "CANDLE"] as const) : (["LINE", "AREA"] as const)).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kindShown === k}
                className={`h-5 rounded-sm px-2 text-[9.5px] font-bold tracking-[0.08em] ${kindShown === k ? "oasis-on" : "text-zinc-500 hover:text-zinc-200"}`}>{k === "CANDLE" ? "CANDLES" : k}</button>
            ))}
          </span>
        </span>
      </div>

      {pickOpen && (
        <div className={`${MONO} flex max-h-[220px] flex-none flex-col overflow-hidden rounded-sm border border-white/[0.08] bg-[var(--oasis-panel)]`}>
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setHit(0); }} spellCheck={false} placeholder="COMPARE WITH… TICKER OR NAME (ETFS + STOCKS) — ↑↓ ENTER"
            role="combobox" aria-expanded aria-controls={listId} aria-autocomplete="list"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHit((h) => Math.min(found.length - 1, h + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setHit((h) => Math.max(0, h - 1)); }
              if (e.key === "Enter" && (found.length || needle)) { const f = found[hit] ?? found[0]; addExtra(f?.sym ?? needle, f?.label ?? needle); }
              if (e.key === "Escape") setPickOpen(false);
            }}
            className="h-8 flex-none border-b border-white/[0.06] bg-transparent px-3 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600" />
          <div id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto">
            {found.map((p, i) => {
              const on = main.sym === p.sym || lines.some((l) => l.sym === p.sym);
              return (
                <button key={p.sym} type="button" disabled={on} onClick={() => addExtra(p.sym, p.label)} onMouseEnter={() => setHit(i)}
                  className={`grid w-full grid-cols-[70px_minmax(0,1fr)_40px] items-center gap-2 border-b border-white/[0.03] px-3 py-1.5 text-left text-[11px] hover:bg-white/[0.04] disabled:opacity-40 ${i === hit && needle ? "bg-white/[0.05]" : ""}`}>
                  <span className="font-bold text-zinc-100">{p.label}</span>
                  <span className="truncate font-sans text-zinc-500">{p.sub ?? ""}</span>
                  <span className="text-right text-zinc-500">{on ? "ON" : "+ ADD"}</span>
                </button>
              );
            })}
            {!found.length && <p className="m-0 px-3 py-2 text-[10.5px] text-zinc-600">Press Enter to add “{needle}”.</p>}
          </div>
        </div>
      )}

      {/* timeframe rail — directly above the canvas */}
      <div className="flex flex-none items-center gap-3">
        <SegRail items={tfs} value={tfs.includes(tf) ? tf : tfs[0]} pos={pos} onChange={pick} width={Math.max(360, tfs.length * 44)} disabled={disabledTfs} />
        <span className={`${MONO} hidden text-[9.5px] tracking-[0.1em] text-zinc-600 xl:inline`}>{mGeo ? <button type="button" onClick={measure.clear} className="text-oasis hover:text-white">CLEAR MEASURE ×</button> : "CTRL + DRAG = MEASURE"}</span>
      </div>

      <div className="relative min-h-[170px] min-w-0 flex-1">
        <div ref={box} className="absolute inset-0" />
        {/* measurement layer: only catches the pointer while Ctrl / ⌘ is held (otherwise the chart pans / zooms as usual) */}
        <div {...measure.handlers} className="absolute inset-0 z-[2]"
          style={{ pointerEvents: measure.armed || measure.span?.live ? "auto" : "none", cursor: measure.armed ? "crosshair" : undefined }}
          onKeyDown={(e) => { if (e.key === "Escape") measure.clear(); }}>
          {mGeo && (
            <>
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                <line x1={mGeo.A.x} y1={mGeo.A.y} x2={mGeo.B.x} y2={mGeo.B.y} stroke="#3b82f6" strokeWidth={2} />
                <line x1={mGeo.A.x} y1={0} x2={mGeo.A.x} y2="100%" stroke="#3b82f6" strokeOpacity={0.25} strokeDasharray="3 3" />
                <line x1={mGeo.B.x} y1={0} x2={mGeo.B.x} y2="100%" stroke="#3b82f6" strokeOpacity={0.25} strokeDasharray="3 3" />
                <circle cx={mGeo.A.x} cy={mGeo.A.y} r={3.5} fill="#3b82f6" />
                <circle cx={mGeo.B.x} cy={mGeo.B.y} r={3.5} fill="#3b82f6" />
              </svg>
              <span className={`${MONO} pointer-events-none absolute z-[3] -translate-x-1/2 whitespace-nowrap rounded-sm border border-[#3b82f6]/60 bg-[var(--oasis-bg)]/95 px-2 py-1 text-[10.5px] font-bold tabular-nums`}
                style={{ left: (mGeo.A.x + mGeo.B.x) / 2, top: Math.max(4, Math.min(mGeo.A.y, mGeo.B.y) - 34) }}>
                <span className={mGeo.pct >= 0 ? "text-emerald-400" : "text-rose-400"}>{sgn(mGeo.pct)}</span>
                <span className="ml-2 font-normal text-zinc-400">{mGeo.from} → {mGeo.to} · {mGeo.bars} BARS</span>
              </span>
            </>
          )}
        </div>
        {!ready && <div className="absolute inset-0 animate-pulse bg-white/[0.02]" />}
      </div>
      {stats && (
        <div className={`${MONO} flex flex-none flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/[0.05] pt-2 text-[10.5px] tabular-nums`}>
          {ready?.model ? (
            <span className="text-zinc-600">Statistics need live prices — not shown for model data.</span>
          ) : !win ? (
            <span className="text-zinc-600">{ready ? "Not enough bars in the visible window for statistics." : "Loading prices…"}</span>
          ) : (
            <>
              {([
                ["RETURN", sgn(win.ret), win.ret, STAT_INFO.ret],
                ["CAGR", win.cagr != null ? sgn(win.cagr) : "— (< 1Y)", win.cagr ?? 0, STAT_INFO.cagr],
                ["MAX DD", win.maxDD.toFixed(2) + "%", win.maxDD, STAT_INFO.dd],
                ["VOLATILITY", win.vol != null ? win.vol.toFixed(1) + "% ann." : "— (intraday)", 0, STAT_INFO.vol],
              ] as const).map(([l, v, n, hint]) => (
                <span key={l} className="flex items-baseline gap-1.5" title={hint}>
                  <span className="cursor-help text-[9.5px] font-bold tracking-[0.12em] text-zinc-500 underline decoration-white/15 decoration-dotted underline-offset-[3px]">{l}</span>
                  <span className={n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-zinc-200"}>{v}</span>
                </span>
              ))}
              <span className="ml-auto text-[9.5px] tracking-[0.08em] text-zinc-600">{main.label} · VISIBLE WINDOW · PRICE RETURN</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
