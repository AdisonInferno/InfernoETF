"use client";

import Link from "next/link";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ETFS, fmtAum } from "@/lib/etfs";
import { QUOTE } from "@/lib/fund-profiles";
import {
  SCENARIOS,
  drawdownPath,
  drillDown,
  lookThrough,
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

/* ───────────────────── Shared: close (X) button ───────────────────── */

function CloseBtn({ onClick, title }: { onClick?: () => void; title: string }) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Hide ${title}`}
      aria-label={`Hide ${title}`}
      className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-white/[0.08] hover:text-white"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.6"><path d="M1 1l8 8M9 1L1 9" /></svg>
    </button>
  );
}

/* ───────────────────── Sector overlap breakdown ───────────────────── */

function SectorOverlap({ positions, onClose }: { positions: Position[]; onClose?: () => void }) {
  const rows = useMemo(() => sectorExposure(positions).slice(0, 9), [positions]);
  const max = Math.max(...rows.map((r) => r.total), 1);
  const colorOf = (t: string) => SEG_COLORS[positions.findIndex((p) => p.asset.ticker === t) % SEG_COLORS.length];

  return (
    <div className={`${panel} flex h-full min-w-0 flex-col gap-4`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`${label} truncate text-zinc-300`}>SECTOR OVERLAP BREAKDOWN</span>
        <div className="flex min-w-0 items-center gap-2">
          <CloseBtn onClick={onClose} title="Sector Overlap Breakdown" />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-around gap-2.5">
        {rows.map((r) => {
          const contributors = Object.keys(r.by).length;
          return (
            <div key={r.sector} className="grid grid-cols-[minmax(80px,130px)_minmax(0,1fr)_52px] items-center gap-3">
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

function DrawdownSim({ positions, onClose }: { positions: Position[]; onClose?: () => void }) {
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
    <div className={`${panel} flex h-full min-w-0 flex-col gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`${label} truncate text-zinc-300`}>RISK · DRAWDOWN SIMULATION</span>
        <div className="flex flex-wrap items-center gap-1">
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
          <CloseBtn onClick={onClose} title="Risk · Drawdown Simulation" />
        </div>
      </div>

      <div className="relative h-[220px]">
        <svg viewBox="0 0 1000 180" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ef4444" stopOpacity="0" />
              <stop offset="1" stopColor="#ef4444" stopOpacity="0.18" />
            </linearGradient>
          </defs>
          <line x1="0" x2="1000" y1={y(100)} y2={y(100)} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          {/* Left-to-right reveal via clip (pathLength breaks on a stretched viewBox). */}
          <clipPath id="ddReveal">
            <motion.rect key={`clip-${sc}`} x="0" y="0" height="180" initial={{ width: 0 }} animate={{ width: 1000 }} transition={{ duration: 0.9, ease: "easeInOut" }} />
          </clipPath>
          <g clipPath="url(#ddReveal)">
            <polygon points={`0,${y(100)} ${line} 1000,${y(100)}`} fill="url(#ddFill)" />
            <polyline points={line} fill="none" stroke="#f87171" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
          </g>
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
    </div>
  );
}

/* ───────────────────── ETFs in the portfolio (+ look-through) ───────────────────── */

const NOTIONAL = 10_000;
const terFmt = (ter: number) => `${ter.toFixed(Math.abs(ter * 100 - Math.round(ter * 100)) > 1e-6 ? 4 : 2)}%`;
const normTic = (t: string) => (t === "GOOG" ? "GOOGL" : t);

/** One position's underlying stocks, share classes merged (GOOG + GOOGL → GOOGL). */
function lookRows(p: Position, n: number) {
  const m = new Map<string, { ticker: string; name: string; inFund: number; inPortfolio: number }>();
  for (const r of drillDown(p, 500)) {
    const k = normTic(r.ticker), cur = m.get(k);
    if (cur) { cur.inFund += r.inFund; cur.inPortfolio += r.inPortfolio; cur.name = cur.name.replace(/ Class [AC]$/, ""); }
    else m.set(k, { ...r, ticker: k });
  }
  return [...m.values()].sort((a, b) => b.inFund - a.inFund).slice(0, n);
}

function PortfolioEtfs({ positions, onClose }: { positions: Position[]; onClose?: () => void }) {
  const [open, setOpen] = useState<string | null>(positions.find((p) => p.asset.kind === "etf")?.asset.ticker ?? null);
  /** Total look-through weight of every stock across the whole portfolio, % */
  const total = useMemo(() => lookThrough(positions), [positions]);
  /** How many positions hold each stock */
  const holders = useMemo(() => {
    const n: Record<string, number> = {};
    positions.forEach((p) => lookRows(p, 500).forEach((r) => { n[r.ticker] = (n[r.ticker] ?? 0) + 1; }));
    return n;
  }, [positions]);

  const rows = positions.map((p, i) => {
    const etf = ETFS.find((e) => e.ticker === p.asset.ticker);
    const ter = QUOTE[p.asset.ticker]?.[1] ?? 0;
    return { p, i, etf, ter };
  });
  const funds = rows.filter((r) => r.etf);
  const blendedTer = funds.reduce((a, r) => a + (r.p.weight / 100) * r.ter, 0);
  const yearlyCost = (NOTIONAL * blendedTer) / 100;

  return (
    <div className={`${panel} flex h-full min-w-0 flex-col gap-4`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`${label} truncate text-zinc-300`}>ETFS IN YOUR PORTFOLIO</span>
        <div className="flex min-w-0 items-center gap-2">
          <CloseBtn onClick={onClose} title="ETFs in your portfolio" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/[0.04] bg-black/20 px-3 py-2">
          <div className={label}>BLENDED TER</div>
          <div className="mt-1 font-mono text-[15px] font-semibold text-zinc-100">{blendedTer.toFixed(3)}%</div>
        </div>
        <div className="rounded-lg border border-white/[0.04] bg-black/20 px-3 py-2">
          <div className={label}>FEES / YEAR</div>
          <div className="mt-1 font-mono text-[15px] font-semibold text-zinc-100">${yearlyCost.toFixed(2)} <span className="text-[9px] font-normal text-zinc-600">/ ${NOTIONAL.toLocaleString("en-US")}</span></div>
        </div>
        <div className="rounded-lg border border-white/[0.04] bg-black/20 px-3 py-2">
          <div className={label}>PRICIEST</div>
          <div className="mt-1 font-mono text-[15px] font-semibold text-amber-400">{funds.length ? [...funds].sort((a, b) => b.ter - a.ter)[0].p.asset.ticker : "—"}</div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map(({ p, i, etf, ter }) => {
          const color = SEG_COLORS[i % SEG_COLORS.length];
          const isOpen = open === p.asset.ticker;
          const look = lookRows(p, 12);
          return (
            <div key={p.asset.ticker} className={`overflow-hidden rounded-lg border transition-colors ${isOpen ? "border-white/[0.1] bg-white/[0.015]" : "border-white/[0.04] bg-black/20"}`}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : p.asset.ticker)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
              >
                <span className="h-10 w-1 flex-none rounded-full" style={{ background: color }} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[15px] font-bold text-zinc-50">{p.asset.ticker}</span>
                    <span className="rounded bg-white/[0.06] px-1.5 py-px font-mono text-[9px] font-bold tracking-[0.1em] text-zinc-400">{etf ? etf.sector : "STOCK"}</span>
                  </span>
                  <span className="truncate text-[11.5px] text-zinc-500">{etf ? `${p.asset.name} · ${etf.issuer}` : p.asset.name}</span>
                </div>
                <div className="hidden flex-col items-end sm:flex">
                  <span className={label}>TER</span>
                  <span className="font-mono text-[12px] text-zinc-200">{etf ? terFmt(ter) : "—"}</span>
                </div>
                <div className="hidden w-16 flex-col items-end md:flex">
                  <span className={label}>AUM</span>
                  <span className="font-mono text-[12px] text-zinc-200">{etf ? fmtAum(etf.aum) : "—"}</span>
                </div>
                <div className="flex w-16 flex-col items-end">
                  <span className={label}>YTD</span>
                  <span className={`font-mono text-[12px] font-semibold ${p.asset.ytd >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{pct(p.asset.ytd)}</span>
                </div>
                <div className="flex w-14 flex-col items-end">
                  <span className={label}>WEIGHT</span>
                  <span className="font-mono text-[13px] font-semibold text-zinc-100">{p.weight}%</span>
                </div>
                <motion.span animate={{ rotate: isOpen ? 90 : 0 }} className="w-4 text-center font-mono text-[11px] text-zinc-500">▶</motion.span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="border-t border-white/[0.05] bg-black/20"
                  >
                    <div className="grid grid-cols-[60px_minmax(0,1fr)_64px_84px_92px] gap-3 px-4 pb-1 pt-3 font-mono text-[9px] tracking-[0.12em] text-zinc-600">
                      <span>STOCK</span><span />
                      <span className="text-right">IN {p.asset.kind === "etf" ? "ETF" : "POS"}</span>
                      <span className="text-right" title={`Weight in ETF × ${p.weight}% of portfolio`}>VIA {p.asset.ticker}</span>
                      <span className="text-right" title="Summed across every position that holds it">TOTAL</span>
                    </div>
                    {look.map((r) => {
                      const k = r.ticker, n = holders[k] ?? 1;
                      return (
                        <div key={r.ticker} className="grid grid-cols-[60px_minmax(0,1fr)_64px_84px_92px] items-center gap-3 px-4 py-1.5">
                          <span className="truncate font-mono text-[12px] font-bold text-zinc-200">{r.ticker}</span>
                          <span className="truncate text-[12px] text-zinc-500">{r.name}</span>
                          <span className="text-right font-mono text-[12px] text-zinc-400">{r.inFund.toFixed(2)}%</span>
                          <span className="text-right font-mono text-[12px] text-zinc-200">{r.inPortfolio.toFixed(2)}%</span>
                          <span className="flex items-center justify-end gap-1.5 font-mono text-[12px] font-semibold text-zinc-50">
                            {n > 1 && <span className="font-mono text-[9px] font-bold text-amber-400" title={`Held by ${n} positions`}>×{n}</span>}
                            {(total[k] ?? r.inPortfolio).toFixed(2)}%
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-2">
                      <span className="font-mono text-[9.5px] text-zinc-600">
                        TOP {look.length} · {look.reduce((a, r) => a + r.inPortfolio, 0).toFixed(1)}% OF PORTFOLIO · <span className="text-amber-400">×N</span> = ALSO IN OTHER POSITIONS
                      </span>
                      {etf && (
                        <Link href={`/etf/${p.asset.ticker}`} className="whitespace-nowrap font-mono text-[10.5px] tracking-[0.1em] text-zinc-400 hover:text-white">
                          [ {p.asset.ticker} DEEP VIEW → ]
                        </Link>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────── Resizable split row ───────────────────── */

type PaneId = "sector" | "etfs";
const PANE_TITLE: Record<PaneId, string> = { sector: "Sector Overlap", etfs: "ETFs in portfolio" };
const MIN_RATIO = 0.28;
const LAYOUT_KEY = "inferno.portfolio.split.v2";

/** Narrow "+" rail that brings a hidden panel back. */
function AddRail({ id, onAdd }: { id: PaneId; onAdd: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onAdd}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      title={`Show ${PANE_TITLE[id]}`}
      className="group flex w-12 flex-none flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/[0.08] bg-black/20 text-zinc-500 transition-colors hover:border-red-500/40 hover:text-white"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.05] text-[16px] leading-none group-hover:bg-red-500/20 group-hover:text-red-300">+</span>
      <span className="font-mono text-[10px] font-bold tracking-[0.14em] [writing-mode:vertical-rl]">{PANE_TITLE[id].toUpperCase()}</span>
    </motion.button>
  );
}

/**
 * Sector Overlap ⇄ ETFs in portfolio: one joined strip, equal heights, a draggable divider
 * to trade width between them (double-click resets), X to hide a panel, + to bring it back.
 */
function SplitRow({ positions }: { positions: Position[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(0.5); // width share of the left (sector) panel
  const [shown, setShown] = useState<Record<PaneId, boolean>>({ sector: true, etfs: true });
  const [dragging, setDragging] = useState(false);

  // Remember the layout per browser.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LAYOUT_KEY);
      if (raw) {
        const v = JSON.parse(raw) as { ratio: number; shown: Record<PaneId, boolean> };
        /* eslint-disable react-hooks/set-state-in-effect -- one-time restore from browser storage */
        setRatio(Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, v.ratio)));
        if (v.shown && "etfs" in v.shown) setShown(v.shown);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({ ratio, shown })); } catch { /* ignore */ }
  }, [ratio, shown]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = rowRef.current;
    if (!el) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    const rect = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const r = (ev.clientX - rect.left) / rect.width;
      setRatio(Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, r)));
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") setRatio((r) => Math.max(MIN_RATIO, r - 0.04));
    if (e.key === "ArrowRight") setRatio((r) => Math.min(1 - MIN_RATIO, r + 0.04));
  };

  const both = shown.sector && shown.etfs;
  const hide = (id: PaneId) => setShown((s) => ({ ...s, [id]: false }));
  const show = (id: PaneId) => setShown((s) => ({ ...s, [id]: true }));
  const spring = dragging ? { duration: 0 } : { type: "spring" as const, stiffness: 260, damping: 30 };

  if (!shown.sector && !shown.etfs) {
    return (
      <div className="flex gap-3">
        {(["sector", "etfs"] as PaneId[]).map((id) => (
          <button key={id} type="button" onClick={() => show(id)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.08] py-6 font-mono text-[11px] font-bold tracking-[0.12em] text-zinc-500 transition-colors hover:border-red-500/40 hover:text-white">
            <span className="text-[15px]">+</span> {PANE_TITLE[id].toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={rowRef} className={`flex flex-col items-stretch gap-4 xl:flex-row xl:gap-0 ${dragging ? "cursor-col-resize select-none" : ""}`}>
      <AnimatePresence initial={false}>
        {!shown.sector && <AddRail key="add-sector" id="sector" onAdd={() => show("sector")} />}
      </AnimatePresence>
      {!shown.sector && <div className="hidden w-3 xl:block" />}

      {shown.sector && (
        <motion.div
          layout
          transition={spring}
          className={`min-w-0 ${both ? "xl:w-[var(--split-w)] xl:flex-none" : "flex-1"}`}
          style={{ "--split-w": `calc(${ratio * 100}% - 6px)` } as React.CSSProperties}
        >
          <SectorOverlap positions={positions} onClose={() => hide("sector")} />
        </motion.div>
      )}

      {both && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={Math.round(MIN_RATIO * 100)}
          aria-valuemax={Math.round((1 - MIN_RATIO) * 100)}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onDoubleClick={() => setRatio(0.5)}
          onKeyDown={onKey}
          title="Drag to resize · double-click to reset"
          className="group relative hidden w-3 flex-none cursor-col-resize touch-none items-center justify-center outline-none xl:flex"
        >
          <span className={`h-full w-px transition-colors ${dragging ? "bg-red-500/70" : "bg-white/[0.06] group-hover:bg-red-500/50 group-focus-visible:bg-red-500/50"}`} />
          <span className={`absolute flex h-10 w-2.5 flex-col items-center justify-center gap-[3px] rounded-full border transition-colors ${dragging ? "border-red-500/60 bg-[#1a0b0b]" : "border-white/[0.1] bg-[#0f0f11] group-hover:border-red-500/40"}`}>
            {[0, 1, 2].map((d) => <span key={d} className={`h-[3px] w-[3px] rounded-full ${dragging ? "bg-red-400" : "bg-zinc-500 group-hover:bg-red-300"}`} />)}
          </span>
        </div>
      )}

      {shown.etfs && (
        <motion.div layout transition={spring} className="min-w-0 flex-1">
          <PortfolioEtfs positions={positions} onClose={() => hide("etfs")} />
        </motion.div>
      )}

      {!shown.etfs && <div className="hidden w-3 xl:block" />}
      <AnimatePresence initial={false}>
        {!shown.etfs && <AddRail key="add-etfs" id="etfs" onAdd={() => show("etfs")} />}
      </AnimatePresence>
    </div>
  );
}

/* ───────────────────── Composition ───────────────────── */

export default function PortfolioDeepView({ positions }: { positions: Position[] }) {
  if (!positions.length) return null;
  return (
    <div className="flex flex-col gap-4">
      <motion.div custom={0} variants={reveal} initial="hidden" animate="show">
        <SplitRow positions={positions} />
      </motion.div>
      <motion.div custom={1} variants={reveal} initial="hidden" animate="show">
        <DrawdownSim positions={positions} />
      </motion.div>
    </div>
  );
}
