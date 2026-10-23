"use client";

/* ─────────────────────────────────────────────────────────────
   CHART GRID — XTB-style wall of small price charts, read-only (no drawing tools, no pan / zoom):
   candles where the feed has real OHLC, a line otherwise. ONE timeline (top-left) drives every cell.
   Used for "what moves this ETF" (Performance Drivers) and the portfolio HOLDINGS tab.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef } from "react";
import { CandlestickSeries, ColorType, CrosshairMode, LineSeries, LineStyle, createChart, type UTCTimestamp } from "lightweight-charts";
import Link from "next/link";
import { SegRail } from "@/components/InfernoChart";
import { periodWindow, rangeFor, usePriceSeries } from "@/components/deep-view/useHoldingReturns";

export type GridTf = "1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "5Y";
export const GRID_TFS: GridTf[] = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"];

type Bars = { t: number[]; c: number[]; o?: number[]; h?: number[]; l?: number[] };
export interface GridItem { sym: string; label: string; sub?: string; /** e.g. "20.1% wt · −1.4 pp" */ note?: string; href?: string }

/* same range + window as the return calculations (useHoldingReturns), so a cell's % equals the attribution's return */
const crop = (s: Bars | null, tf: GridTf): Bars | null => periodWindow(s, tf);

function MiniChart({ bars }: { bars: Bars }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      handleScroll: false, handleScale: false, // look, don't edit
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#71717a", fontFamily: "'Geist Mono Variable', ui-monospace, monospace", fontSize: 9, attributionLogo: false },
      grid: { vertLines: { color: "rgba(255,255,255,0.025)" }, horzLines: { color: "rgba(255,255,255,0.035)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.05)", scaleMargins: { top: 0.08, bottom: 0.06 } },
      timeScale: { borderColor: "rgba(255,255,255,0.05)", timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "rgba(255,255,255,0.18)", style: LineStyle.Dashed, labelBackgroundColor: "#27272a" }, horzLine: { color: "rgba(255,255,255,0.18)", style: LineStyle.Dashed, labelBackgroundColor: "#27272a" } },
    });
    const ohlc = !!(bars.o && bars.h && bars.l);
    const seen = new Set<number>();
    const idx = bars.t.map((_, i) => i).filter((i) => !seen.has(bars.t[i]) && seen.add(bars.t[i]));
    if (ohlc) {
      chart.addSeries(CandlestickSeries, { upColor: "#26a69a", downColor: "#ef5350", borderVisible: false, wickUpColor: "#26a69a", wickDownColor: "#ef5350", priceLineVisible: true, lastValueVisible: true })
        .setData(idx.map((i) => ({ time: bars.t[i] as UTCTimestamp, open: bars.o![i], high: bars.h![i], low: bars.l![i], close: bars.c[i] })));
    } else {
      chart.addSeries(LineSeries, { color: "#60a5fa", lineWidth: 2, priceLineVisible: true, lastValueVisible: true })
        .setData(idx.map((i) => ({ time: bars.t[i] as UTCTimestamp, value: bars.c[i] })));
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [bars]);
  return <div ref={box} className="absolute inset-0" />;
}

export default function ChartGrid({ items, tf, onTf, title, hint, minCell = 260, cols, onRemove, onFocus, rowMin = 180, tools }: {
  items: GridItem[];
  tf: GridTf;
  onTf: (t: GridTf) => void;
  title: string;
  /** one line under the title (why these instruments) */
  hint?: string;
  /** min cell width, px — the grid wraps responsively */
  minCell?: number;
  /** fixed number of columns (overrides minCell auto-fill) */
  cols?: number;
  /** × on each cell */
  onRemove?: (sym: string) => void;
  /** ⤢ on each cell — show this one large */
  onFocus?: (sym: string) => void;
  /** min row height, px */
  rowMin?: number;
  /** extra controls right of the title */
  tools?: React.ReactNode;
}) {
  const syms = useMemo(() => items.map((i) => i.sym), [items]);
  const px = usePriceSeries(syms, rangeFor(tf));
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col gap-2 oasis-glass border border-white/[0.05] bg-[var(--oasis-panel)] p-3">
      {/* the one timeline for every chart — big, top-left */}
      <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-1.5">
        <SegRail items={GRID_TFS} value={tf} onChange={onTf} width={GRID_TFS.length * 46} />
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-[10.5px] font-bold tracking-[0.16em] text-zinc-200">{title}</span>
          {hint && <span className="truncate font-mono text-[9.5px] text-zinc-600">{hint}</span>}
        </div>
        {tools && <div className="ml-auto flex flex-wrap items-center gap-1.5">{tools}</div>}
      </div>
      <div className="grid min-h-0 flex-1 gap-2" style={{ gridAutoRows: `minmax(${rowMin}px, 1fr)`, gridTemplateColumns: cols ? `repeat(${cols}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${minCell}px, 1fr))` }}>
        {items.map((it) => {
          const bars = crop(px.series[it.sym.toUpperCase()] ?? null, tf);
          const chg = bars ? ((bars.c[bars.c.length - 1] - bars.c[0]) / bars.c[0]) * 100 : null;
          return (
            <div key={it.sym} className="flex min-h-0 min-w-0 flex-col rounded-sm border border-white/[0.05] bg-[var(--oasis-bg)]">
              <div className="flex flex-none items-baseline gap-2 px-2 pt-1.5 font-mono tabular-nums">
                {it.href ? <Link href={it.href} className="text-[12px] font-bold text-zinc-100 hover:text-oasis">{it.label}</Link> : <span className="text-[12px] font-bold text-zinc-100">{it.label}</span>}
                <span className="min-w-0 flex-1 truncate font-sans text-[10.5px] text-zinc-500">{it.sub}</span>
                {chg != null && <span className={`text-[11px] font-bold ${chg >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{chg >= 0 ? "+" : "−"}{Math.abs(chg).toFixed(2)}%</span>}
                {onFocus && <button type="button" onClick={() => onFocus(it.sym)} title="Show this chart large" className="text-[11px] text-zinc-500 hover:text-white">⤢</button>}
                {onRemove && <button type="button" onClick={() => onRemove(it.sym)} title="Remove from the board" className="text-[13px] leading-none text-zinc-500 hover:text-rose-400">×</button>}
              </div>
              {it.note && <div className="flex-none px-2 font-mono text-[9.5px] text-zinc-500">{it.note}</div>}
              <div className="relative min-h-0 flex-1">
                {bars ? <MiniChart bars={bars} />
                  : <div className="flex h-full items-center justify-center font-mono text-[10px] tracking-[0.1em] text-zinc-600">{px.state === "loading" ? "LOADING…" : "NO PRICE HISTORY"}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
