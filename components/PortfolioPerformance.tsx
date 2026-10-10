"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { buildFund } from "@/components/deep-view/buildFund";
import { TF, makeSeries } from "@/components/deep-view/mockData";
import type { Tf } from "@/components/deep-view/types";
import type { Asset, Position } from "@/lib/portfolio";

export type RangeTf = Extract<Tf, "1M" | "YTD" | "1Y" | "5Y">;
const RANGES: RangeTf[] = ["1M", "YTD", "1Y", "5Y"];
const BENCH = "SPY";
const label = "font-mono text-[10px] font-semibold tracking-[0.14em] text-zinc-500";
const pct = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";

/** Per-timeframe % change + volatility for any asset (ETF → its Deep View data, stock → derived from YTD). */
export function perfOf(a: Asset): { perf: Record<RangeTf, number>; volMul: number } {
  const fund = a.kind === "etf" ? buildFund(a.ticker) : null;
  if (fund) return { perf: { "1M": fund.perf["1M"], YTD: fund.perf.YTD, "1Y": fund.perf["1Y"], "5Y": fund.perf["5Y"] }, volMul: fund.volMul };
  return { perf: { "1M": a.ytd / 9, YTD: a.ytd, "1Y": a.ytd * 1.3, "5Y": Math.max(-90, a.ytd * 7) }, volMul: 1.9 };
}

/** Normalised (start = 0%) return path. Portfolio = buy-and-hold mix of its positions. */
function returnPath(positions: Position[], tf: RangeTf): number[] {
  const n = TF[tf].points;
  const out = new Array(n).fill(0);
  for (const { asset, weight } of positions) {
    const { perf, volMul } = perfOf(asset);
    const s = makeSeries(tf, asset.price, perf[tf], asset.ticker, volMul);
    for (let i = 0; i < n; i++) out[i] += (weight / 100) * (s[i] / s[0] - 1) * 100;
  }
  return out;
}

export default function PortfolioPerformance({ positions, chartHeight = 200, tf: tfProp, onTfChange }: {
  positions: Position[];
  chartHeight?: number;
  /** Controlled timeframe (optional) — lets sibling panels follow the chart's range. */
  tf?: RangeTf;
  onTfChange?: (tf: RangeTf) => void;
}) {
  const [tfLocal, setTfLocal] = useState<RangeTf>("YTD");
  const tf = tfProp ?? tfLocal;
  const setTf = (k: RangeTf) => { setTfLocal(k); onTfChange?.(k); };
  const [hover, setHover] = useState<number | null>(null);

  const { mine, bench } = useMemo(() => {
    const spy = buildFund(BENCH);
    const benchPath = spy
      ? makeSeries(tf, spy.price, spy.perf[tf], spy.tic, spy.volMul).map((v, _i, arr) => (v / arr[0] - 1) * 100)
      : new Array(TF[tf].points).fill(0);
    return { mine: returnPath(positions, tf), bench: benchPath };
  }, [positions, tf]);

  const n = mine.length;
  const all = mine.concat(bench, [0]);
  const lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1;
  const y = (v: number) => 6 + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * 188;
  const x = (i: number) => (i / (n - 1)) * 1000;
  const line = (arr: number[]) => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const i = hover ?? n - 1;
  const myEnd = mine[i], benchEnd = bench[i];
  const alpha = myEnd - benchEnd;
  const ahead = mine[n - 1] >= bench[n - 1];

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-white/[0.05] bg-[#030303]/60 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <span className={`${label} text-zinc-300`}>PERFORMANCE</span>
          <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-zinc-300"><span className="h-0.5 w-4 rounded-full bg-emerald-400" />MY PORTFOLIO</span>
          <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-zinc-400"><span className="h-0 w-4 border-t border-dashed border-zinc-400" />S&amp;P 500 · {BENCH}</span>
        </div>
        <div className="flex gap-1">
          {RANGES.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => { setTf(k); setHover(null); }}
              className={`rounded-md px-2.5 py-1 font-mono text-[10.5px] font-bold transition-colors ${tf === k ? "bg-white/[0.1] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]" : "text-zinc-500 hover:text-zinc-200"}`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="relative cursor-crosshair" style={{ height: chartHeight }}>
        <svg viewBox="0 0 1000 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="pfFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#34d399" stopOpacity="0.18" />
              <stop offset="1" stopColor="#34d399" stopOpacity="0" />
            </linearGradient>
            {/* Left-to-right reveal (pathLength is unreliable with a stretched viewBox). */}
            <clipPath id="pfReveal">
              <motion.rect key={`clip-${tf}`} x="0" y="0" height="200" initial={{ width: 0 }} animate={{ width: 1000 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
            </clipPath>
          </defs>
          <g clipPath="url(#pfReveal)">
          <line x1="0" x2="1000" y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <polygon points={`0,${y(0)} ${line(mine)} 1000,${y(0)}`} fill="url(#pfFill)" />
          <polyline
            points={line(bench)}
            fill="none"
            stroke="#a1a1aa"
            strokeWidth="1.3"
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={line(mine)}
            fill="none"
            stroke="#34d399"
            strokeWidth="1.9"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          </g>
        </svg>
        <span className="absolute right-0 font-mono text-[9.5px] text-zinc-600" style={{ top: `${(y(0) / 200) * 100}%`, transform: "translateY(-120%)" }}>0%</span>

        {hover !== null && (
          <>
            <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-white/20" style={{ left: `${(x(i) / 1000) * 100}%` }} />
            <div className="pointer-events-none absolute -ml-1 -mt-1 h-2 w-2 rounded-full bg-emerald-400" style={{ left: `${(x(i) / 1000) * 100}%`, top: `${(y(mine[i]) / 200) * 100}%` }} />
            <div className="pointer-events-none absolute -ml-1 -mt-1 h-2 w-2 rounded-full border border-zinc-300 bg-[#030303]" style={{ left: `${(x(i) / 1000) * 100}%`, top: `${(y(bench[i]) / 200) * 100}%` }} />
          </>
        )}
      </div>

      <div className="flex justify-between font-mono text-[9.5px] tracking-[0.08em] text-zinc-600">
        {TF[tf].axis.map((a) => <span key={a}>{a}</span>)}
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-white/[0.05] pt-2.5">
        <div>
          <div className={label}>MY PORTFOLIO</div>
          <div className={`mt-1 font-mono text-[15px] font-semibold tabular-nums ${myEnd >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{pct(myEnd)}</div>
        </div>
        <div>
          <div className={label}>S&amp;P 500</div>
          <div className={`mt-1 font-mono text-[15px] font-semibold tabular-nums ${benchEnd >= 0 ? "text-zinc-100" : "text-rose-400"}`}>{pct(benchEnd)}</div>
        </div>
        <div>
          <div className={label}>{hover === null ? (ahead ? "BEATING S&P BY" : "TRAILING S&P BY") : "DIFFERENCE"}</div>
          <div className={`mt-1 font-mono text-[15px] font-semibold tabular-nums ${alpha >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{(alpha >= 0 ? "+" : "") + alpha.toFixed(2)} pp</div>
        </div>
      </div>
    </div>
  );
}
