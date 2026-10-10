"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { FundData } from "./types";
import { hash01, seeded } from "./utils";

/* ─────────────────────────────────────────────────────────────
   Institutional price chart (TradingView lightweight-charts v5)
   ┌──┬ [1W 1M 3M YTD 1Y 3Y ALL]          [Line|Candles] [+ Indicator] ┐
   │✛ │  OHLC legend                                                    │
   │─ │  price pane (drag = pan · wheel = zoom)                         │
   │↕ │  volume histogram (bottom 18%)                                  │
   └──┴─────────────────────────────────────────────────────────────────┘
   Drawing tools are React state + chart API (price lines) + an
   absolutely-positioned overlay that follows pan/zoom.
   All OHLCV data is deterministic placeholder data.
   ───────────────────────────────────────────────────────────── */

const RANGES = ["1W", "1M", "3M", "YTD", "1Y", "3Y", "ALL"] as const;
type Range = (typeof RANGES)[number];
type ChartKind = "line" | "candles";
type Tool = "crosshair" | "hline" | "range";
type IndicatorId = "sma20" | "sma50" | "ema200" | "volume";

const INDICATORS: { id: IndicatorId; label: string; color: string }[] = [
  { id: "sma20", label: "SMA 20", color: "#fbbf24" },
  { id: "sma50", label: "SMA 50", color: "#60a5fa" },
  { id: "ema200", label: "EMA 200", color: "#c084fc" },
  { id: "volume", label: "Volume", color: "#71717a" },
];

const UP = "#34d399", DOWN = "#f87171";
const UP_VOL = "rgba(52,211,153,0.35)", DOWN_VOL = "rgba(248,113,113,0.35)";
const MONO = "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace";
/** Last bar: Fri 2 Oct 2026. Fixed so server + client agree. */
const END = Date.UTC(2026, 9, 2);
const YEARS = 6;

interface Bar { time: UTCTimestamp; open: number; high: number; low: number; close: number; volume: number }

/* ── Mock OHLCV ───────────────────────────────────────────── */

/** ~6 years of daily bars ending at the fund's last price, with the 5Y move matching `perf5y`. */
function makeBars(tic: string, lastPx: number, perf5y: number, volMul: number, aumB: number): Bar[] {
  // Trading days, oldest → newest
  const days: number[] = [];
  for (let t = END; days.length < YEARS * 252; t -= 864e5) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(t);
  }
  days.reverse();
  const n = days.length;
  const rnd = seeded(Math.floor(hash01(tic + "ohlc") * 1e9));
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  const sigma = 0.0105 * volMul;
  const shocks: number[] = [];
  let regime = 1;
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.01) regime = 0.7 + rnd() * 1.4;           // vol regimes
    shocks.push(gauss() * sigma * regime);
  }
  // Drift so the last 5Y (1260 bars) return equals perf5y and the series ends at lastPx.
  const k5 = Math.min(n - 1, 1260);
  const target = Math.log(1 + Math.max(-0.95, perf5y / 100));
  const raw5 = shocks.slice(n - k5).reduce((a, b) => a + b, 0);
  const mu = (target - raw5) / k5;
  const logRet = shocks.map((s) => s + mu);

  const closes = new Array<number>(n);
  closes[n - 1] = lastPx;
  for (let i = n - 1; i > 0; i--) closes[i - 1] = closes[i] / Math.exp(logRet[i]);

  const baseVol = Math.max(2e5, aumB * 9e4);
  return closes.map((c, i) => {
    const prev = i ? closes[i - 1] : c / Math.exp(logRet[0]);
    const open = prev * (1 + gauss() * sigma * 0.25);
    const wick = Math.abs(gauss()) * sigma * 0.6;
    const high = Math.max(open, c) * (1 + wick * rnd());
    const low = Math.min(open, c) * (1 - wick * rnd());
    const volume = Math.round(baseVol * (0.6 + rnd() * 0.8) * (1 + Math.abs(logRet[i]) / sigma * 0.35));
    return { time: (days[i] / 1000) as UTCTimestamp, open: +open.toFixed(2), high: +high.toFixed(2), low: +low.toFixed(2), close: +c.toFixed(2), volume };
  });
}

function sma(bars: Bar[], len: number) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  let sum = 0;
  bars.forEach((b, i) => {
    sum += b.close;
    if (i >= len) sum -= bars[i - len].close;
    if (i >= len - 1) out.push({ time: b.time, value: +(sum / len).toFixed(2) });
  });
  return out;
}
function ema(bars: Bar[], len: number) {
  const k = 2 / (len + 1);
  let e = bars[0]?.close ?? 0;
  return bars.map((b, i) => { e = i ? b.close * k + e * (1 - k) : b.close; return { time: b.time, value: +e.toFixed(2) }; }).slice(len - 1);
}

/** Number of bars covered by each range button. */
function barsFor(r: Range, bars: Bar[]): number {
  if (r === "ALL") return bars.length;
  if (r === "YTD") {
    const jan1 = Date.UTC(new Date(END).getUTCFullYear(), 0, 1) / 1000;
    return bars.filter((b) => b.time >= jan1).length;
  }
  return { "1W": 5, "1M": 21, "3M": 63, "1Y": 252, "3Y": 756 }[r];
}

const fmt = (v: number) => v.toFixed(2);
const sgn = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "%";
const volFmt = (v: number) => (v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : (v / 1e3).toFixed(0) + "K");

/* ── Toolbar icons ────────────────────────────────────────── */

const ICONS: Record<Tool, React.ReactNode> = {
  crosshair: <path d="M10 2v5M10 13v5M2 10h5M13 10h5" />,
  hline: <><path d="M2 10h16" /><circle cx="6" cy="10" r="1.6" fill="currentColor" /><circle cx="14" cy="10" r="1.6" fill="currentColor" /></>,
  range: <><path d="M4 4h12M4 16h12M10 6v8" /><path d="M8 8l2-2 2 2M8 12l2 2 2-2" /></>,
};
const TOOL_TITLE: Record<Tool, string> = {
  crosshair: "Crosshair (C)",
  hline: "Horizontal line — click to place (H)",
  range: "Price range — click start, then end (R)",
};

/* ── Component ────────────────────────────────────────────── */

interface HLine { id: number; price: number }
interface RangeDraw { t1: Time; p1: number; t2: Time; p2: number }

export default function TradingChart({ fund }: { fund: FundData }) {
  const bars = useMemo(() => makeBars(fund.tic, fund.price, fund.perf["5Y"], fund.volMul, fund.aumB), [fund]);

  const [range, setRange] = useState<Range>("1Y");
  const [kind, setKind] = useState<ChartKind>("candles");
  const [tool, setTool] = useState<Tool>("crosshair");
  const [ind, setInd] = useState<Set<IndicatorId>>(() => new Set(["volume"]));
  const [menu, setMenu] = useState(false);
  const [hlines, setHlines] = useState<HLine[]>([]);
  const [ranges, setRanges] = useState<RangeDraw[]>([]);
  const [pending, setPending] = useState<{ t: Time; p: number } | null>(null);
  const [hover, setHover] = useState<Bar | null>(null);
  /** Screen geometry of drawings — recomputed from chart callbacks (pan/zoom/resize/redraw). */
  const [geoms, setGeoms] = useState<{ boxes: ({ x: number; y: number }[] | null)[]; dot: { x: number; y: number } | null }>({ boxes: [], dot: null });

  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const indRef = useRef<Map<IndicatorId, ISeriesApi<"Line">>>(new Map());
  const lineRefs = useRef<IPriceLine[]>([]);
  // Latest tool/pending state for the (stable) chart click handler.
  const toolRef = useRef(tool); const pendingRef = useRef(pending); const rangesRef = useRef(ranges);
  useEffect(() => { toolRef.current = tool; pendingRef.current = pending; rangesRef.current = ranges; });

  /** Convert drawings (time, price) → pixel coordinates. Only called outside render. */
  const recompute = useCallback(() => {
    const c = chartRef.current, m = mainRef.current;
    const at = (t: Time, pr: number) => {
      const x = c?.timeScale().timeToCoordinate(t), y = m?.priceToCoordinate(pr);
      return x == null || y == null ? null : { x, y };
    };
    const boxes = rangesRef.current.map((r) => { const a = at(r.t1, r.p1), b = at(r.t2, r.p2); return a && b ? [a, b] : null; });
    const pd = pendingRef.current;
    setGeoms({ boxes, dot: pd ? at(pd.t, pd.p) : null });
  }, []);
  useEffect(() => {
    const id = requestAnimationFrame(() => recompute());
    return () => cancelAnimationFrame(id);
  }, [ranges, pending, kind, recompute]);

  /* 1 ── Create the chart once per fund */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0a0a0c" }, textColor: "#71717a", fontFamily: MONO, fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: "rgba(255,255,255,0.025)" }, horzLines: { color: "rgba(255,255,255,0.035)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.05)", scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: "rgba(255,255,255,0.05)", rightOffset: 4, barSpacing: 6, minBarSpacing: 0.5 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(255,255,255,0.22)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#27272a" },
        horzLine: { color: "rgba(255,255,255,0.22)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#27272a" },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    chartRef.current = chart;

    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? UP_VOL : DOWN_VOL })));
    volRef.current = vol;

    const bump = () => recompute();
    chart.timeScale().subscribeVisibleLogicalRangeChange(bump);
    chart.timeScale().subscribeSizeChange(bump);

    const onMove = (p: MouseEventParams) => {
      if (!p.time) { setHover(null); return; }
      setHover(bars.find((b) => b.time === p.time) ?? null);
    };
    chart.subscribeCrosshairMove(onMove);

    const onClick = (p: MouseEventParams) => {
      const s = mainRef.current;
      if (!p.point || !p.time || !s) return;
      const price = s.coordinateToPrice(p.point.y);
      if (price == null) return;
      if (toolRef.current === "hline") {
        setHlines((l) => [...l, { id: Date.now(), price: +price.toFixed(2) }]);
      } else if (toolRef.current === "range") {
        const start = pendingRef.current;
        if (!start) setPending({ t: p.time, p: price });
        else { setRanges((r) => [...r, { t1: start.t, p1: start.p, t2: p.time!, p2: price }]); setPending(null); }
      }
    };
    chart.subscribeClick(onClick);

    const series = indRef.current;
    return () => {
      chart.unsubscribeClick(onClick);
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null; mainRef.current = null; volRef.current = null;
      series.clear(); lineRefs.current = [];
    };
  }, [bars, recompute]);

  /* 2 ── Main series: line ⇄ candles */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (mainRef.current) { chart.removeSeries(mainRef.current); lineRefs.current = []; }
    const s: ISeriesApi<SeriesType> =
      kind === "candles"
        ? chart.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, priceLineColor: "rgba(255,255,255,0.25)" })
        : chart.addSeries(LineSeries, { color: UP, lineWidth: 2, priceLineColor: "rgba(255,255,255,0.25)", crosshairMarkerRadius: 4, crosshairMarkerBackgroundColor: "#0a0a0c" });
    if (kind === "candles") s.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    else s.setData(bars.map((b) => ({ time: b.time, value: b.close })));
    mainRef.current = s;
  }, [kind, bars]);

  /* 3 ── Horizontal lines (re-applied whenever the main series or list changes) */
  useEffect(() => {
    const s = mainRef.current;
    if (!s) return;
    lineRefs.current.forEach((l) => s.removePriceLine(l));
    lineRefs.current = hlines.map((h) =>
      s.createPriceLine({ price: h.price, color: "#fbbf24", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "S/R" })
    );
  }, [hlines, kind, bars]);

  /* 4 ── Indicators + volume visibility */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const map = indRef.current;
    for (const def of INDICATORS) {
      if (def.id === "volume") continue;
      const on = ind.has(def.id);
      const have = map.get(def.id);
      if (on && !have) {
        const s = chart.addSeries(LineSeries, { color: def.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData(def.id === "sma20" ? sma(bars, 20) : def.id === "sma50" ? sma(bars, 50) : ema(bars, 200));
        map.set(def.id, s);
      } else if (!on && have) {
        chart.removeSeries(have);
        map.delete(def.id);
      }
    }
    const v = ind.has("volume");
    volRef.current?.applyOptions({ visible: v });
    chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.08, bottom: v ? 0.22 : 0.06 } });
  }, [ind, bars]);

  /* 5 ── Range buttons → visible window */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const k = barsFor(range, bars);
    chart.timeScale().setVisibleLogicalRange({ from: bars.length - k - 0.5, to: bars.length - 0.5 + 3 });
  }, [range, bars]);

  /* 6 ── Crosshair on/off (axis labels come with it) */
  const [crossOn, setCrossOn] = useState(true);
  useEffect(() => {
    chartRef.current?.applyOptions({ crosshair: { mode: crossOn ? CrosshairMode.Normal : CrosshairMode.Hidden } });
  }, [crossOn]);

  /* Close the indicator menu on outside click; keyboard shortcuts */
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (e.key === "Escape") { setPending(null); setTool("crosshair"); setMenu(false); }
      else if (e.key.toLowerCase() === "c") setCrossOn((c) => !c);
      else if (e.key.toLowerCase() === "h") setTool((t) => (t === "hline" ? "crosshair" : "hline"));
      else if (e.key.toLowerCase() === "r") setTool((t) => (t === "range" ? "crosshair" : "range"));
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, []);

  /* ── Derived numbers for header + legend ── */
  const k = barsFor(range, bars);
  const first = bars[Math.max(0, bars.length - k - 1)], last = bars[bars.length - 1];
  const chg = (last.close / first.close - 1) * 100;
  const shown = hover ?? last;
  const shownIdx = bars.indexOf(shown);
  const prevClose = shownIdx > 0 ? bars[shownIdx - 1].close : shown.open;
  const barChg = (shown.close / prevClose - 1) * 100;


  const toggleInd = (id: IndicatorId) => setInd((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickTool = (t: Tool) => {
    if (t === "crosshair") { setCrossOn((c) => !c); setTool("crosshair"); }
    else setTool((cur) => (cur === t ? "crosshair" : t));
    setPending(null);
  };
  const clearDrawings = () => { setHlines([]); setRanges([]); setPending(null); };
  const drawing = tool === "hline" || tool === "range";

  return (
    <div className="flex h-[560px] flex-none overflow-hidden rounded-2xl border border-white/[0.05] bg-[#0a0a0c] font-mono">
      {/* ── Left drawing toolbar ── */}
      <div className="flex w-12 flex-none flex-col items-center gap-1 border-r border-white/[0.05] bg-[#0a0a0c] py-3">
        {(Object.keys(ICONS) as Tool[]).map((t) => {
          const on = t === "crosshair" ? crossOn : tool === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => pickTool(t)}
              title={TOOL_TITLE[t]}
              aria-pressed={on}
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${on ? "bg-emerald-400/[0.1] text-emerald-400 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.35)]" : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-100"}`}
            >
              <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[t]}</svg>
            </button>
          );
        })}
        <span className="my-1 h-px w-6 bg-white/[0.06]" />
        <button
          type="button"
          onClick={clearDrawings}
          disabled={!hlines.length && !ranges.length && !pending}
          title="Remove all drawings"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-red-400 disabled:pointer-events-none disabled:opacity-30"
        >
          <svg viewBox="0 0 20 20" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" /></svg>
        </button>
        {(hlines.length > 0 || ranges.length > 0) && <span className="text-[9px] text-zinc-600">{hlines.length + ranges.length}</span>}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Header ── */}
        <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[0.05] px-3 py-2.5">
          <div role="tablist" aria-label="Range" className="flex items-center rounded-lg border border-white/[0.05] bg-[#030303] p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={r === range}
                onClick={() => setRange(r)}
                className={`h-7 min-w-[38px] rounded-md px-2 text-[11px] font-bold tracking-[0.04em] transition-colors ${r === range ? "bg-white/[0.08] text-emerald-400 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.35)]" : "text-zinc-500 hover:text-zinc-100"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <span className="flex items-baseline gap-2 tabular-nums">
            <span className="text-[18px] font-semibold text-neutral-50">${fmt(last.close)}</span>
            <span className={`text-[12px] font-bold ${chg >= 0 ? "text-emerald-400" : "text-red-400"}`}>{sgn(chg)}</span>
            <span className="text-[10px] tracking-[0.12em] text-zinc-600">{range}</span>
          </span>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-white/[0.05] bg-[#030303] p-0.5">
              {(["line", "candles"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setKind(c)}
                  aria-pressed={kind === c}
                  className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] transition-colors ${kind === c ? "bg-white/[0.08] text-white" : "text-zinc-500 hover:text-zinc-100"}`}
                >
                  <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                    {c === "line" ? <path d="M1 10l3-4 3 2 3-5 3 3" /> : <><path d="M4 2v10M10 1v12" /><rect x="2.5" y="4" width="3" height="5" fill="currentColor" /><rect x="8.5" y="3" width="3" height="6" /></>}
                  </svg>
                  {c}
                </button>
              ))}
            </div>

            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenu((m) => !m)}
                aria-expanded={menu}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 text-[10.5px] font-bold tracking-[0.08em] text-zinc-300 transition-colors hover:border-emerald-400/50 hover:text-emerald-400"
              >
                [ + ADD INDICATOR ]{ind.size > 0 && <span className="rounded bg-white/[0.08] px-1 text-[9.5px] text-zinc-400">{ind.size}</span>}
              </button>
              {menu && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-52 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a0c] py-1 shadow-[0_12px_32px_rgba(0,0,0,0.6)]">
                  {INDICATORS.map((d) => {
                    const on = ind.has(d.id);
                    return (
                      <button key={d.id} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => toggleInd(d.id)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[11px] text-zinc-300 hover:bg-white/[0.05]">
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border" style={{ borderColor: on ? d.color : "#3f3f46", background: on ? d.color : "transparent" }}>
                          {on && <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden><path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="#030303" strokeWidth="2" strokeLinecap="round" /></svg>}
                        </span>
                        <span className="flex-1">{d.label}</span>
                        <span className="h-0.5 w-4 rounded-full" style={{ background: d.color }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Chart + overlays ── */}
        <div className={`relative min-h-0 flex-1 ${drawing ? "cursor-crosshair" : ""}`}>
          <div ref={boxRef} className="absolute inset-0" />

          {/* OHLC legend */}
          <div className="pointer-events-none absolute left-3 top-2 z-10 flex flex-col gap-1 text-[10.5px] tabular-nums">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="font-bold text-zinc-200">{fund.tic} · 1D</span>
              {(["O", "H", "L", "C"] as const).map((l) => (
                <span key={l} className="text-zinc-500">{l} <span className={barChg >= 0 ? "text-emerald-400" : "text-red-400"}>{fmt(l === "O" ? shown.open : l === "H" ? shown.high : l === "L" ? shown.low : shown.close)}</span></span>
              ))}
              <span className={barChg >= 0 ? "text-emerald-400" : "text-red-400"}>{sgn(barChg)}</span>
              {ind.has("volume") && <span className="text-zinc-500">VOL <span className="text-zinc-300">{volFmt(shown.volume)}</span></span>}
            </div>
            {INDICATORS.filter((d) => d.id !== "volume" && ind.has(d.id)).length > 0 && (
              <div className="flex gap-3">
                {INDICATORS.filter((d) => d.id !== "volume" && ind.has(d.id)).map((d) => (
                  <span key={d.id} className="flex items-center gap-1.5 text-zinc-500"><span className="h-0.5 w-3 rounded-full" style={{ background: d.color }} />{d.label}</span>
                ))}
              </div>
            )}
          </div>

          {/* Price-range drawings */}
          <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
            {ranges.map((r, i) => {
              const g = geoms.boxes[i];
              if (!g) return null;
              const [a, b] = g;
              const up = r.p2 >= r.p1, d = r.p2 - r.p1, pct = (r.p2 / r.p1 - 1) * 100;
              const left = Math.min(a.x, b.x), top = Math.min(a.y, b.y);
              return (
                <div key={i} className={`absolute border ${up ? "border-emerald-400/60 bg-emerald-400/[0.08]" : "border-red-400/60 bg-red-400/[0.08]"}`} style={{ left, top, width: Math.max(2, Math.abs(b.x - a.x)), height: Math.max(2, Math.abs(b.y - a.y)) }}>
                  <span className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold text-[#030303] ${up ? "-top-6 bg-emerald-400" : "-bottom-6 bg-red-400"}`}>
                    {d >= 0 ? "+" : "−"}{Math.abs(d).toFixed(2)} ({sgn(pct)})
                  </span>
                </div>
              );
            })}
            {pending && geoms.dot && <span className="absolute -ml-1 -mt-1 h-2 w-2 rounded-full bg-emerald-400" style={{ left: geoms.dot.x, top: geoms.dot.y }} />}
          </div>

          {/* Tool hint */}
          {drawing && (
            <div className="pointer-events-none absolute bottom-10 left-1/2 z-10 -translate-x-1/2 rounded-md border border-white/[0.08] bg-[#030303]/90 px-2.5 py-1 text-[10px] tracking-[0.1em] text-zinc-400">
              {tool === "hline" ? "CLICK TO PLACE A SUPPORT / RESISTANCE LINE · ESC TO EXIT" : pending ? "CLICK THE END POINT" : "CLICK THE START POINT · ESC TO EXIT"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
