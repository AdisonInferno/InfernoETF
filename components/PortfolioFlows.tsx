"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { perfOf, type RangeTf } from "@/components/PortfolioPerformance";
import { SEG_COLORS } from "@/components/PortfolioDeepView";
import { sectorExposure, type Position } from "@/lib/portfolio";

/* ─────────────────────────────────────────────────────────────
   Capital flow over the chart's selected timeframe (buy-and-hold).
   Each position's weight drifts with its own return:
       w_end = w · (1 + r) / Σ w_j · (1 + r_j)
   Left:  where capital moved between positions (Δ pp of portfolio)
   Right: the same drift aggregated by look-through sector
   Both sorted by size of change, largest first — not by weight.
   ───────────────────────────────────────────────────────────── */

const label = "font-mono text-[10px] font-semibold tracking-[0.14em] text-zinc-500";
const pp = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);

interface Row { key: string; from: number; to: number; delta: number; color?: string }

function Bars({ title, rows }: { title: string; rows: Row[] }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.delta)), 0.01);
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-white/[0.05] bg-[#030303]/60 p-3.5">
      <span className={`${label} text-zinc-300`}>{title}</span>
      {/* Direction key, aligned with the bar track */}
      <div className="grid grid-cols-[minmax(0,92px)_minmax(0,1fr)_52px] gap-2 font-mono text-[9.5px] font-bold tracking-[0.14em]">
        <span />
        <div className="flex justify-between"><span className="text-rose-400">OUTFLOW</span><span className="text-emerald-400">INFLOW</span></div>
        <span />
      </div>
      <div className="flex flex-col gap-[7px]">
        {rows.map((r, i) => {
          const w = (Math.abs(r.delta) / max) * 50; // % of the track, each side is 50%
          const up = r.delta >= 0;
          return (
            <div key={r.key} className="grid grid-cols-[minmax(0,92px)_minmax(0,1fr)_52px] items-center gap-2" title={`${r.key}: ${r.from.toFixed(1)}% → ${r.to.toFixed(1)}%`}>
              <span className="flex min-w-0 items-center gap-1.5">
                {r.color && <span className="h-2 w-2 flex-none rounded-sm" style={{ background: r.color }} />}
                <span className="truncate font-mono text-[11px] text-zinc-300">{r.key}</span>
              </span>
              {/* Diverging track: centre line = no change */}
              <div className="relative h-3">
                <span className="absolute inset-y-0 left-1/2 w-px bg-white/[0.12]" />
                <motion.span
                  key={`${r.key}-${r.delta.toFixed(3)}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${w}%` }}
                  transition={{ duration: 0.5, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                  className={`absolute inset-y-[2px] rounded-sm ${up ? "left-1/2 bg-emerald-400/80" : "right-1/2 bg-rose-400/80"}`}
                />
              </div>
              <span className={`text-right font-mono text-[11px] font-semibold tabular-nums ${up ? "text-emerald-400" : "text-rose-400"}`}>{pp(r.delta)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PortfolioFlows({ positions, tf }: { positions: Position[]; tf: RangeTf }) {
  const { posRows, secRows } = useMemo(() => {
    const grown = positions.map((p) => p.weight * (1 + perfOf(p.asset).perf[tf] / 100));
    const total = grown.reduce((a, v) => a + v, 0) || 1;
    const endPositions: Position[] = positions.map((p, i) => ({ asset: p.asset, weight: (grown[i] / total) * 100 }));

    const posRows: Row[] = positions
      .map((p, i) => ({ key: p.asset.ticker, from: p.weight, to: endPositions[i].weight, delta: endPositions[i].weight - p.weight, color: SEG_COLORS[i % SEG_COLORS.length] }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const start = Object.fromEntries(sectorExposure(positions).map((s) => [s.sector, s.total]));
    const end = Object.fromEntries(sectorExposure(endPositions).map((s) => [s.sector, s.total]));
    const secRows: Row[] = Array.from(new Set([...Object.keys(start), ...Object.keys(end)]))
      .map((k) => ({ key: k, from: start[k] ?? 0, to: end[k] ?? 0, delta: (end[k] ?? 0) - (start[k] ?? 0) }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8);
    return { posRows, secRows };
  }, [positions, tf]);

  return (
    <div className="grid h-full min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2">
      <Bars title="CAPITAL FLOW" rows={posRows} />
      <Bars title="SECTOR SHIFT" rows={secRows} />
    </div>
  );
}
