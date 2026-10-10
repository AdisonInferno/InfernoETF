"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { FundData } from "./types";
import { binaryTreemap, hash01 } from "./utils";
import { ExplorerChart, ExplorerTable, useHoldingsExplorer } from "./HoldingsPerformance";

type MapTf = "12M" | "6M" | "3M" | "1M" | "1D";
const MAP_TFS: MapTf[] = ["12M", "6M", "3M", "1M", "1D"];
/** [volatility scale, bias] per timeframe — placeholder; replace with real per-ticker returns. */
const SCALE: Record<MapTf, [number, number]> = { "12M": [50, 8], "6M": [30, 5], "3M": [20, 3], "1M": [10, 1.5], "1D": [3, 0.2] };
const fp = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "%";

function tileColor(v: number, sc: number) {
  const a = Math.min(1, Math.abs(v) / sc);
  if (Math.abs(v) < sc * 0.04) return "radial-gradient(circle at 50% 50%,#4B5563,#1F2937)";
  const r = (n: number[]) => n.map(Math.round).join(",");
  return v >= 0
    ? `radial-gradient(circle at 50% 50%,rgb(${r([90 - a * 20, 130 + a * 90, 90 - a * 50])}),rgb(${r([28, 70 + a * 60, 36])}))`
    : `radial-gradient(circle at 50% 50%,rgb(${r([150 + a * 105, 60 - a * 10, 90 - a * 15])}),rgb(${r([100 + a * 50, 28, 46 + a * 4])}))`;
}

/* ── Treemap ───────────────────────────────────────────────── */

/** Measures its box so the treemap is laid out at the panel's real aspect ratio. */
function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 1000, h: 300 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function HoldingsMap({ fund, tf }: { fund: FundData; tf: MapTf }) {
  const [sc, bias] = SCALE[tf];
  const [ref, { w: W, h: H }] = useBoxSize<HTMLDivElement>();
  const items = useMemo(
    () => fund.holdings.filter((x) => x.w > 0).map((x) => ({ ...x, v: (hash01(x.tic + tf) * 2 - 1) * sc * 0.8 + bias * 0.5 })),
    [fund.holdings, tf, sc, bias]
  );
  const tiles = useMemo(() => binaryTreemap(items, (i) => i.w, 0, 0, W, H), [items, W, H]);

  return (
    <div ref={ref} className="relative h-full overflow-hidden rounded-lg">
      {tiles.map(({ item: it, x, y, w, h }) => {
        const m = Math.min(w, h), big = w > 150 && h > 70, fs = Math.max(9, Math.min(40, m / 3.6));
        return (
          <div
            key={it.tic}
            title={`${it.name} · ${it.w.toFixed(2)}% weight · ${fp(it.v)}`}
            className="absolute box-border cursor-default overflow-hidden border border-[#0a0a0c] text-white transition-[filter] duration-200 hover:z-[2] hover:brightness-[1.18]"
            style={{ left: x, top: y, width: w, height: h, background: tileColor(it.v, sc), padding: `${big ? 6 : 3}px ${big ? 9 : 5}px` }}
          >
            <div className="whitespace-nowrap font-display font-semibold leading-[1.05]" style={{ fontSize: fs, opacity: w < 26 || h < 14 ? 0 : 1 }}>{it.tic}</div>
            <div className="whitespace-nowrap font-mono font-bold leading-[1.15]" style={{ fontSize: Math.max(9, fs * 0.55), opacity: w < 46 || h < 34 ? 0 : 0.92 }}>{fp(it.v)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Collapsible panel ─────────────────────────────────────── */

type PanelId = "map" | "table" | "chart";
const HEADER_H = 40;
/** flex-grow weights when expanded.
    Left column: table ≈ 40 % of the height · chart ≈ 60 %
    Columns:     left ≈ 80 % of the width · map ≈ 20 % (a tall, narrow rectangle) */
const ROW_WEIGHT = 40, CHART_WEIGHT = 60;
const LEFT_WEIGHT = 8, MAP_WEIGHT = 2;

function Panel({ title, meta, tools, expanded, onToggle, weight, axis = "y", children }: {
  title: string; meta?: ReactNode; tools?: ReactNode; expanded: boolean; onToggle: () => void; weight: number;
  /** "y" = stacked in a column (collapses to a 40px bar), "x" = side by side in a row (collapses to a 40px rail) */
  axis?: "x" | "y";
  children: ReactNode;
}) {
  const horiz = axis === "x";
  const reduce = useReducedMotion();
  const ease = [0.22, 1, 0.36, 1] as const;
  return (
    <motion.section
      layout={!reduce}
      initial={false}
      animate={{ flexGrow: expanded ? weight : 0 }}
      transition={{ duration: reduce ? 0 : 0.42, ease }}
      style={horiz ? { flexShrink: 1, flexBasis: HEADER_H, minWidth: HEADER_H } : { flexShrink: 1, flexBasis: HEADER_H, minHeight: HEADER_H }}
      className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.05] bg-[#0a0a0c]"
    >
      {expanded ? (
        <header className="flex h-10 flex-none items-center gap-3 border-b border-white/[0.05] pl-4 pr-1.5">
          <h3 className="m-0 whitespace-nowrap font-mono text-[10.5px] font-bold tracking-[0.18em] text-neutral-300">{title}</h3>
          <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-zinc-600">{meta}</span>
          <span className="ml-auto flex items-center gap-1.5">
            {tools}
            <button
              type="button"
              onClick={onToggle}
              aria-expanded
              aria-label={`Collapse ${title}`}
              title="Collapse"
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-white/[0.06] hover:text-white"
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </span>
        </header>
      ) : horiz ? (
        /* Collapsed side panel → narrow vertical rail */
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          aria-label={`Expand ${title}`}
          title={`Expand ${title}`}
          className="group flex h-full w-full flex-col items-center gap-3 py-3 transition-colors hover:bg-white/[0.04]"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3 flex-none text-zinc-600 transition-colors group-hover:text-emerald-400" aria-hidden><path d="M2 6h8M6 2v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          <span className="whitespace-nowrap font-mono text-[10.5px] font-bold tracking-[0.18em] text-zinc-500 transition-colors [writing-mode:vertical-rl] group-hover:text-white">{title}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          aria-label={`Expand ${title}`}
          className="group flex h-10 w-full flex-none items-center gap-3 pl-4 pr-3 text-left transition-colors hover:bg-white/[0.04]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-700 transition-colors group-hover:bg-emerald-400" />
          <span className="whitespace-nowrap font-mono text-[10.5px] font-bold tracking-[0.18em] text-zinc-500 transition-colors group-hover:text-white">{title}</span>
          <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-zinc-700">{meta}</span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.14em] text-zinc-600 transition-colors group-hover:text-emerald-400">
            <span className="opacity-0 transition-opacity group-hover:opacity-100">EXPAND</span>
            <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M2 6h8M6 2v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </span>
        </button>
      )}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.25, delay: reduce ? 0 : 0.12 } }}
            exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.12 } }}
            className="min-h-0 flex-1"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/* ── Workspace ─────────────────────────────────────────────── */

export default function CompositionMap({ fund }: { fund: FundData }) {
  const x = useHoldingsExplorer(fund);
  const [open, setOpen] = useState<Record<PanelId, boolean>>({ map: true, table: true, chart: true });
  const flip = (id: PanelId) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const [tf, setTf] = useState<MapTf>("1D");
  const nMap = fund.holdings.filter((h) => h.w > 0).length;

  return (
    /* Viewport-height workspace: [table over chart] | [tall map]. */
    <div className="flex h-[calc(100dvh-300px)] min-h-[660px] flex-none gap-4 px-3 pb-6 pt-5">
      {/* Left: holdings table over the chart */}
      <div className="flex min-w-0 flex-col gap-4" style={{ flex: `${LEFT_WEIGHT} 1 0px` }}>
        <Panel
          title="HOLDINGS"
          meta={`${x.rows.length}/${nMap} · Σ ${x.rows.reduce((a, r) => a + r.w, 0).toFixed(1)}% · ${x.shown.length} PLOTTED`}
          weight={ROW_WEIGHT}
          expanded={open.table}
          onToggle={() => flip("table")}
        >
          <ExplorerTable x={x} />
        </Panel>
        <Panel
          title="RELATIVE PERFORMANCE · 1Y"
          meta={`${fund.tic} + ${x.shown.length} · NORMALISED TO 0% · PLACEHOLDER DATA`}
          weight={CHART_WEIGHT}
          expanded={open.chart}
          onToggle={() => flip("chart")}
        >
          <ExplorerChart x={x} />
        </Panel>
      </div>

      {/* Right: composition map as a tall rectangle (collapses to a rail) */}
      <Panel
        title="MAP"
        meta={tf}
        weight={MAP_WEIGHT}
        axis="x"
        expanded={open.map}
        onToggle={() => flip("map")}
        tools={
          <span className="hidden gap-1 sm:flex">
            {MAP_TFS.map((k) => (
              <button key={k} type="button" onClick={() => setTf(k)} className={`flex h-6 min-w-7 items-center justify-center rounded-md px-1.5 font-mono text-[10px] font-bold ${k === tf ? "bg-white/[0.1] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]" : "text-zinc-500 hover:text-zinc-200"}`}>{k}</button>
            ))}
          </span>
        }
      >
        <div className="h-full p-2"><HoldingsMap fund={fund} tf={tf} /></div>
      </Panel>
    </div>
  );
}
