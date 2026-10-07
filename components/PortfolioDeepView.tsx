"use client";

import Link from "next/link";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useMemo, useState } from "react";
import {
  SCENARIOS,
  correlationMatrix,
  drawdownPath,
  drillDown,
  scenarioLoss,
  sectorExposure,
  type Position,
  type ScenarioId,
} from "@/lib/portfolio";

export const SEG_COLORS = ["#4ade80", "#60a5fa", "#a78bfa", "#f59e0b", "#f472b6", "#22d3ee", "#f87171", "#a3e635"];
const panel = "rounded-xl border border-white/[0.04] bg-black/30 p-5";
const label = "font-mono text-[10px] font-semibold tracking-[0.14em] text-zinc-500";
const pct = (v: number, d = 1) => (v >= 0 ? "+" : "") + v.toFixed(d) + "%";

/* Staggered reveal for the analytics blocks once the card has expanded. */
const reveal: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.25 + i * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } }),
};

/* ───────────────────── Sector overlap breakdown ───────────────────── */

function SectorOverlap({ positions }: { positions: Position[] }) {
  const rows = useMemo(() => sectorExposure(positions).slice(0, 9), [positions]);
  const max = Math.max(...rows.map((r) => r.total), 1);
  const colorOf = (t: string) => SEG_COLORS[positions.findIndex((p) => p.asset.ticker === t) % SEG_COLORS.length];

  return (
    <div className={`${panel} flex flex-col gap-4`}>
      <div className="flex items-baseline justify-between">
        <span className={`${label} text-zinc-300`}>SECTOR OVERLAP BREAKDOWN</span>
        <span className="font-mono text-[10px] text-zinc-600">LOOK-THROUGH · % OF PORTFOLIO</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const contributors = Object.keys(r.by).length;
          return (
            <div key={r.sector} className="grid grid-cols-[130px_minmax(0,1fr)_56px] items-center gap-3">
              <span className="truncate text-[12.5px] text-zinc-300">
                {r.sector}
                {contributors > 1 && <span className="ml-1.5 font-mono text-[9px] text-amber-400">×{contributors}</span>}
              </span>
              <div className="flex h-2.5 overflow-hidden rounded-sm bg-white/[0.04]" style={{ width: `${(r.total / max) * 100}%` }}>
                {Object.entries(r.by).sort((a, b) => b[1] - a[1]).map(([t, v]) => (
                  <div key={t} title={`${t}: ${v.toFixed(1)}%`} style={{ width: `${(v / r.total) * 100}%`, background: colorOf(t) }} className="h-full border-r border-[#0a0a0c] last:border-r-0" />
                ))}
              </div>
              <span className="text-right font-mono text-[12px] font-semibold text-zinc-100">{r.total.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 border-t border-white/[0.04] pt-3">
        {positions.map((p, i) => (
          <span key={p.asset.ticker} className="flex items-center gap-1.5 font-mono text-[10.5px] text-zinc-400">
            <span className="h-2 w-2 rounded-sm" style={{ background: SEG_COLORS[i % SEG_COLORS.length] }} />{p.asset.ticker}
          </span>
        ))}
        <span className="ml-auto font-mono text-[10px] text-zinc-600"><span className="text-amber-400">×N</span> = sector held by N positions</span>
      </div>
    </div>
  );
}

/* ───────────────────── Risk / drawdown simulation ───────────────────── */

function DrawdownSim({ positions }: { positions: Position[] }) {
  const [sc, setSc] = useState<ScenarioId>("rates");
  const scenario = SCENARIOS.find((s) => s.id === sc)!;
  const loss = useMemo(() => scenarioLoss(positions, sc), [positions, sc]);
  const bench = useMemo(() => scenarioLoss([{ asset: positions[0]?.asset, weight: 100 }].filter((p) => p.asset) as Position[], sc), [positions, sc]);
  const path = drawdownPath(loss.total, scenario.months);
  const lo = Math.min(...path, 60), hi = 102;
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * 164;
  const line = path.map((v, i) => `${(i / (path.length - 1)) * 1000},${y(v).toFixed(1)}`).join(" ");
  const trough = path.indexOf(Math.min(...path));

  return (
    <div className={`${panel} flex flex-col gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`${label} text-zinc-300`}>RISK · DRAWDOWN SIMULATION</span>
        <div className="flex gap-1">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSc(s.id)}
              className={`rounded-md px-2.5 py-1 font-mono text-[10.5px] font-bold transition-colors ${sc === s.id ? "bg-red-500/15 text-red-300 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.35)]" : "bg-white/[0.04] text-zinc-500 hover:text-zinc-200"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-[180px]">
        <svg viewBox="0 0 1000 180" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ef4444" stopOpacity="0" />
              <stop offset="1" stopColor="#ef4444" stopOpacity="0.18" />
            </linearGradient>
          </defs>
          <line x1="0" x2="1000" y1={y(100)} y2={y(100)} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <motion.polygon key={`f-${sc}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} points={`0,${y(100)} ${line} 1000,${y(100)}`} fill="url(#ddFill)" />
          <motion.polyline
            key={sc}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
            points={line}
            fill="none"
            stroke="#f87171"
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="absolute right-0 top-0 font-mono text-[9.5px] text-zinc-600">START 100</span>
        <span className="absolute font-mono text-[10px] font-bold text-rose-400" style={{ left: `${(trough / 23) * 100}%`, top: `${(y(path[trough]) / 180) * 100}%`, transform: "translate(-50%, 6px)" }}>
          {pct(loss.total)}
        </span>
      </div>
      <div className="flex justify-between font-mono text-[9.5px] text-zinc-600"><span>M0</span><span>M6</span><span>M12</span><span>M18</span><span>M24</span></div>

      <div className="grid grid-cols-3 gap-2 border-t border-white/[0.04] pt-3">
        <div><div className={label}>PORTFOLIO</div><div className="mt-1 font-mono text-[16px] font-semibold text-rose-400">{pct(loss.total)}</div></div>
        <div><div className={label}>VS {positions[0]?.asset.ticker ?? "—"} ONLY</div><div className="mt-1 font-mono text-[16px] font-semibold text-zinc-200">{pct(bench.total)}</div></div>
        <div><div className={label}>WORST LEG</div><div className="mt-1 font-mono text-[16px] font-semibold text-zinc-200">{[...loss.per].sort((a, b) => a.dd - b.dd)[0]?.ticker ?? "—"}</div></div>
      </div>
      <p className="font-mono text-[9.5px] text-zinc-600">SIMULATION · PLACEHOLDER DATA · NOT A FORECAST</p>
    </div>
  );
}

/* ───────────────────── Correlation matrix ───────────────────── */

function cellColor(c: number) {
  if (c >= 0) return `rgba(239,68,68,${(0.08 + c * 0.55).toFixed(2)})`;
  return `rgba(96,165,250,${(0.08 + -c * 0.55).toFixed(2)})`;
}

function Correlation({ positions }: { positions: Position[] }) {
  const m = useMemo(() => correlationMatrix(positions), [positions]);
  const n = positions.length;
  const offDiag = m.flatMap((r, i) => r.filter((_, j) => j > i));
  const avg = offDiag.length ? offDiag.reduce((a, v) => a + v, 0) / offDiag.length : 0;

  return (
    <div className={`${panel} flex flex-col gap-4`}>
      <div className="flex items-baseline justify-between">
        <span className={`${label} text-zinc-300`}>CORRELATION MATRIX</span>
        <span className="font-mono text-[10px] text-zinc-600">AVG ρ <span className={avg > 0.6 ? "text-rose-400" : "text-zinc-300"}>{avg.toFixed(2)}</span></span>
      </div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `56px repeat(${n}, minmax(0,1fr))` }}>
        <span />
        {positions.map((p) => <span key={p.asset.ticker} className="truncate pb-1 text-center font-mono text-[10px] font-bold text-zinc-400">{p.asset.ticker}</span>)}
        {positions.map((p, i) => (
          <div key={p.asset.ticker} className="contents">
            <span className="flex items-center font-mono text-[10px] font-bold text-zinc-400">{p.asset.ticker}</span>
            {m[i].map((c, j) => (
              <motion.span
                key={j}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35 + (i + j) * 0.03 }}
                title={`${p.asset.ticker} / ${positions[j].asset.ticker}: ${c.toFixed(2)}`}
                className="flex aspect-square max-h-14 items-center justify-center rounded-sm font-mono text-[11px] font-semibold text-zinc-100"
                style={{ background: i === j ? "rgba(255,255,255,0.06)" : cellColor(c) }}
              >
                {i === j ? "1" : c.toFixed(2)}
              </motion.span>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 font-mono text-[9.5px] text-zinc-600">
        <span>−1</span>
        <div className="h-1.5 flex-1 rounded-full bg-[linear-gradient(90deg,rgba(96,165,250,0.65),rgba(255,255,255,0.06),rgba(239,68,68,0.65))]" />
        <span>+1</span>
        <span className="ml-2">diversifies ← → moves together</span>
      </div>
    </div>
  );
}

/* ───────────────────── Position drill-down ───────────────────── */

function DrillDown({ positions }: { positions: Position[] }) {
  const [open, setOpen] = useState<string | null>(positions[0]?.asset.ticker ?? null);
  return (
    <div className={`${panel} flex flex-col gap-2`}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className={`${label} text-zinc-300`}>POSITION DRILL-DOWN</span>
        <span className="font-mono text-[10px] text-zinc-600">CLICK A POSITION</span>
      </div>
      {positions.map((p, i) => {
        const isOpen = open === p.asset.ticker;
        const rows = drillDown(p);
        const color = SEG_COLORS[i % SEG_COLORS.length];
        return (
          <div key={p.asset.ticker} className="overflow-hidden rounded-lg border border-white/[0.04]">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : p.asset.ticker)}
              className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
            >
              <span className="h-8 w-1 rounded-full" style={{ background: color }} />
              <span className="w-16 font-mono text-[15px] font-bold text-zinc-50">{p.asset.ticker}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-500">{p.asset.name}</span>
              <span className="font-mono text-[13px] font-semibold text-zinc-100">{p.weight}%</span>
              <motion.span animate={{ rotate: isOpen ? 90 : 0 }} className="font-mono text-[11px] text-zinc-500">▶</motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="border-t border-white/[0.04] bg-black/20"
                >
                  <div className="grid grid-cols-[64px_minmax(0,1fr)_80px_96px] gap-3 px-4 pb-1 pt-3 font-mono text-[9.5px] tracking-[0.12em] text-zinc-600">
                    <span>NAME</span><span /><span className="text-right">IN FUND</span><span className="text-right">IN PORTFOLIO</span>
                  </div>
                  {rows.map((r) => (
                    <div key={r.ticker} className="grid grid-cols-[64px_minmax(0,1fr)_80px_96px] items-center gap-3 px-4 py-1.5">
                      <span className="truncate font-mono text-[12px] font-bold text-zinc-200">{r.ticker}</span>
                      <span className="truncate text-[12px] text-zinc-500">{r.name}</span>
                      <span className="text-right font-mono text-[12px] text-zinc-300">{r.inFund.toFixed(2)}%</span>
                      <span className="text-right font-mono text-[12px] font-semibold text-zinc-100">{r.inPortfolio.toFixed(2)}%</span>
                    </div>
                  ))}
                  {p.asset.kind === "etf" && (
                    <div className="px-4 pb-3 pt-2">
                      <Link href={`/etf/${p.asset.ticker}`} className="font-mono text-[11px] tracking-[0.1em] text-zinc-400 hover:text-white">
                        [ OPEN {p.asset.ticker} DEEP VIEW → ]
                      </Link>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────── Composition ───────────────────── */

export default function PortfolioDeepView({ positions }: { positions: Position[] }) {
  if (!positions.length) return null;
  const blocks = [
    <SectorOverlap key="s" positions={positions} />,
    <DrawdownSim key="d" positions={positions} />,
    <Correlation key="c" positions={positions} />,
    <DrillDown key="p" positions={positions} />,
  ];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {blocks.map((b, i) => (
        <motion.div key={i} custom={i} variants={reveal} initial="hidden" animate="show" exit={{ opacity: 0, y: 10, transition: { duration: 0.15 } }}>
          {b}
        </motion.div>
      ))}
    </div>
  );
}
