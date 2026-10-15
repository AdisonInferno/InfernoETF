"use client";

/* Interactive portfolio vs S&P 500 chart (lightweight-charts, % from the start of the window)
   with a vertical timeframe slider on the left: 1Y at the top → 1D at the bottom. */

import { ColorType, CrosshairMode, LineSeries, LineStyle, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { CHART_TFS, portfolioPath, type PTf, type Series } from "@/lib/portfolio-live";
import type { Position } from "@/lib/portfolio";

const MONO = "font-mono";
const pct = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "%";

/** Vertical slider: drag the thumb, click a stop, or use ↑/↓. */
export function TfRail({ value, onChange, tfs = CHART_TFS }: { value: PTf; onChange: (t: PTf) => void; tfs?: PTf[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const idx = Math.max(0, tfs.indexOf(value));
  const pick = (clientY: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const f = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    onChange(tfs[Math.round(f * (tfs.length - 1))]);
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Timeframe"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={tfs.length - 1}
      aria-valuenow={idx}
      aria-valuetext={value}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); onChange(tfs[Math.min(tfs.length - 1, idx + 1)]); }
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); onChange(tfs[Math.max(0, idx - 1)]); }
      }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientY); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientY); }}
      className="relative flex w-[54px] flex-none cursor-ns-resize touch-none select-none py-3 outline-none focus-visible:ring-1 focus-visible:ring-white/30"
    >
      <div ref={ref} className="relative mx-auto w-full flex-1">
        {/* track */}
        <span className="absolute bottom-0 left-[9px] top-0 w-px bg-white/[0.12]" />
        <span className="absolute left-[9px] w-px bg-emerald-400 transition-all duration-150" style={{ top: 0, height: `${(idx / (tfs.length - 1)) * 100}%` }} />
        {tfs.map((t, i) => {
          const on = i === idx;
          return (
            <span key={t} className="absolute left-0 flex -translate-y-1/2 items-center gap-2" style={{ top: `${(i / (tfs.length - 1)) * 100}%` }}>
              <span className={`h-[9px] w-[19px] flex-none rounded-[1px] border transition-all duration-150 ${on ? "border-emerald-300 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]" : "border-white/[0.2] bg-[#030303]"}`} />
              <span className={`${MONO} text-[10.5px] font-bold tracking-[0.06em] ${on ? "text-white" : "text-zinc-500"}`}>{t}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function PortfolioChart({ positions, data, tf, onTfChange, height }: {
  positions: Position[];
  /** price history for the window (from useHistory) */
  data: { series: Record<string, Series>; model: boolean } | null;
  tf: PTf;
  onTfChange: (t: PTf) => void;
  height?: number | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const ser = useRef<{ mine: ISeriesApi<"Line">; bench: ISeriesApi<"Line"> } | null>(null);
  const [hover, setHover] = useState<{ mine: number; bench: number } | null>(null);

  const path = data ? portfolioPath(data.series, Object.fromEntries(positions.map((p) => [p.asset.ticker, p.weight]))) : null;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#030303" }, textColor: "#71717a", fontFamily: "'JetBrains Mono Variable','JetBrains Mono',monospace", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: "rgba(255,255,255,0.025)" }, horzLines: { color: "rgba(255,255,255,0.035)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.05)" },
      timeScale: { borderColor: "rgba(255,255,255,0.05)", timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "rgba(255,255,255,0.2)", style: LineStyle.Dashed, labelBackgroundColor: "#27272a" }, horzLine: { color: "rgba(255,255,255,0.2)", style: LineStyle.Dashed, labelBackgroundColor: "#27272a" } },
      localization: { priceFormatter: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` },
    });
    const bench = chart.addSeries(LineSeries, { color: "#a1a1aa", lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: true, title: "S&P 500" });
    const mine = chart.addSeries(LineSeries, { color: "#34d399", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "MY PORTFOLIO" });
    ser.current = { mine, bench };
    chart.subscribeCrosshairMove((p) => {
      const m = p.seriesData.get(mine) as { value?: number } | undefined, b = p.seriesData.get(bench) as { value?: number } | undefined;
      setHover(p.time && m?.value != null && b?.value != null ? { mine: m.value, bench: b.value } : null);
    });
    chart.timeScale().subscribeSizeChange(() => requestAnimationFrame(() => chart.timeScale().fitContent()));
    chartRef.current = chart;
    return () => { chart.remove(); chartRef.current = null; ser.current = null; };
  }, []);

  const pathKey = path ? `${tf}:${path.t.length}:${path.t[0]}:${path.mine.at(-1)}` : "";
  useEffect(() => {
    if (!path || !ser.current) return;
    const dedupe = (vals: number[]) => {
      const m = new Map<number, number>();
      path.t.forEach((t, i) => m.set(t, vals[i]));
      return [...m].sort((a, b) => a[0] - b[0]).map(([t, value]) => ({ time: t as UTCTimestamp, value }));
    };
    ser.current.mine.setData(dedupe(path.mine));
    ser.current.bench.setData(dedupe(path.bench));
    chartRef.current?.timeScale().fitContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pathKey captures the data
  }, [pathKey]);

  const myEnd = hover?.mine ?? path?.mine.at(-1) ?? 0;
  const bEnd = hover?.bench ?? path?.bench.at(-1) ?? 0;
  const diff = myEnd - bEnd;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 rounded-sm border border-white/[0.06] bg-[#030303] p-3" style={height ? { height } : undefined}>
      <div className="flex flex-wrap items-center gap-4">
        <span className={`${MONO} text-[10px] font-semibold tracking-[0.14em] text-zinc-300`}>PERFORMANCE · {tf}</span>
        <span className={`${MONO} flex items-center gap-1.5 text-[10.5px] text-zinc-300`}><span className="h-0.5 w-4 bg-emerald-400" />MY PORTFOLIO</span>
        <span className={`${MONO} flex items-center gap-1.5 text-[10.5px] text-zinc-400`}><span className="w-4 border-t border-dashed border-zinc-400" />S&amp;P 500</span>
        {data?.model && <span className={`${MONO} ml-auto rounded-sm bg-amber-400/10 px-1.5 py-px text-[9.5px] font-bold tracking-[0.1em] text-amber-300`} title="Live prices unavailable — synthetic path">MODEL DATA</span>}
      </div>
      <div className="flex min-h-[220px] flex-1 gap-2">
        <TfRail value={tf} onChange={onTfChange} />
        <div className="relative min-w-0 flex-1">
          <div ref={box} className="absolute inset-0" />
          {!data && <div className="absolute inset-0 animate-pulse bg-white/[0.02]" />}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-2.5">
        {([["MY PORTFOLIO", myEnd], ["S&P 500", bEnd], ["VS S&P 500", diff]] as const).map(([k, v], i) => (
          <div key={k}>
            <div className={`${MONO} text-[10px] font-semibold tracking-[0.14em] text-zinc-500`}>{k}</div>
            <div className={`${MONO} mt-1 text-[15px] font-semibold tabular-nums ${v >= 0 ? (i === 1 ? "text-zinc-100" : "text-emerald-400") : "text-rose-400"}`}>
              {i === 2 ? (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + " pp" : pct(v)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
