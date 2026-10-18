"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SegRail, type MainDef } from "@/components/InfernoChart";
import type { FundData } from "./types";
import { SECTOR_RGB, squarify } from "./utils";
import { ExplorerChart, ExplorerTable, RetCell, useHoldingsExplorer, type Explorer } from "./HoldingsPerformance";
import { PERIOD_LABEL, RET_PERIODS, RET_SCALE, useHoldingReturns, type CompPeriod } from "./useHoldingReturns";

/* ─────────────────────────────────────────────────────────────
   COMPOSITION MAP
   Two modes over the same treemap (tile size = weight in the fund, tiles grouped by sector):
     COMPOSITION (default) — colour = sector            → what does the ETF own, how concentrated?
     PERFORMANCE           — colour = return over period → which holdings drove it?
   The treemap, the holdings table, the detail bar and the Relative Performance chart share one
   selection, one sector filter and one period (see useHoldingsExplorer).
   ───────────────────────────────────────────────────────────── */

type Mode = "COMPOSITION" | "PERFORMANCE";
const fp = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "%";
const capF = (v: number) => (v <= 0 ? "—" : v >= 1000 ? "$" + (v / 1000).toFixed(2) + "T" : "$" + v.toFixed(0) + "B");
const rgbOf = (parent: string) => SECTOR_RGB[parent] ?? "148,163,184";

function retColor(v: number, sc: number) {
  const a = Math.min(1, Math.abs(v) / sc);
  if (Math.abs(v) < sc * 0.04) return "#27272a";
  const r = (n: number[]) => n.map(Math.round).join(",");
  return v >= 0
    ? `rgb(${r([6 + a * 4, 70 + a * 60, 50 + a * 20])})`
    : `rgb(${r([100 + a * 85, 28, 30])})`;
}
const NA_BG = "repeating-linear-gradient(135deg, #1f1f23 0 6px, #18181b 6px 12px)";

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

const SECTOR_HDR = 17;

function HoldingsMap({ x, mode }: { x: Explorer; mode: Mode }) {
  const [ref, { w: W, h: H }] = useBoxSize<HTMLDivElement>();
  const sc = RET_SCALE[x.ret.period];
  const items = useMemo(() => x.all.filter((r) => r.w > 0), [x.all]);
  const maxW = items[0]?.w ?? 1;

  /* sectors first (squarified by total weight), holdings squarified inside each sector box */
  const layout = useMemo(() => {
    const groups = new Map<string, typeof items>();
    items.forEach((r) => groups.set(r.parent, [...(groups.get(r.parent) ?? []), r]));
    const secs = [...groups].map(([parent, rs]) => ({ parent, rs, v: rs.reduce((a, r) => a + r.w, 0) })).sort((a, b) => b.v - a.v);
    if (!secs.length) return [];
    return squarify(secs, (s) => s.v, 0, 0, W, H).map(({ item: s, x: sx, y: sy, w, h }) => {
      const hdr = w > 72 && h > 46 ? SECTOR_HDR : 0;
      const tiles = squarify(s.rs, (r) => r.w, sx + 1, sy + hdr + 1, Math.max(0, w - 2), Math.max(0, h - hdr - 2));
      return { ...s, x: sx, y: sy, w, h, hdr, tiles };
    });
  }, [items, W, H]);

  return (
    <div ref={ref} className="relative h-full overflow-hidden rounded-sm">
      {layout.map((s) => {
        const c = rgbOf(s.parent);
        const dimSec = !s.rs.some((r) => x.inFilter(r));
        return (
          <div key={s.parent}>
            {/* sector frame + header (click = filter to this sector) */}
            <div className="pointer-events-none absolute box-border border" style={{ left: s.x, top: s.y, width: s.w, height: s.h, borderColor: mode === "COMPOSITION" ? `rgba(${c},0.5)` : "rgba(255,255,255,0.08)", opacity: dimSec ? 0.35 : 1 }} />
            {s.hdr > 0 && (
              <button type="button" onClick={() => x.setFilter(x.filter === `sector:${s.parent}` ? "ALL" : `sector:${s.parent}`)}
                title={`${s.parent} · ${s.v.toFixed(1)}% of the fund — click to ${x.filter === `sector:${s.parent}` ? "show all sectors" : "filter to this sector"}`}
                className="absolute z-[3] flex items-center gap-1.5 overflow-hidden whitespace-nowrap px-1.5 text-left font-mono text-[9.5px] font-bold tracking-[0.14em] hover:underline"
                style={{ left: s.x + 1, top: s.y + 1, width: s.w - 2, height: s.hdr, color: mode === "COMPOSITION" ? `rgb(${c})` : "#a1a1aa", opacity: dimSec ? 0.45 : 1 }}>
                {s.parent.toUpperCase()} <span className="font-medium text-zinc-400">{s.v.toFixed(1)}%</span>
              </button>
            )}
            {s.tiles.map(({ item: it, x: tx, y: ty, w, h }) => {
              const m = Math.min(w, h), big = w > 120 && h > 60, fs = Math.max(9, Math.min(34, m / 3.6));
              const sel = x.selected === it.tic, dim = !x.inFilter(it);
              const v = it.r;
              const bg = mode === "COMPOSITION"
                ? `rgba(${c},${(0.22 + (0.5 * it.w) / maxW).toFixed(3)})`
                : x.ret.state === "loading" ? "#1c1c20" : v == null ? NA_BG : retColor(v, sc);
              const second = mode === "COMPOSITION" ? `${it.w.toFixed(2)}%` : x.ret.state === "loading" ? "···" : v == null ? "N/A" : fp(v);
              return (
                <button
                  key={it.tic}
                  type="button"
                  onClick={() => x.select(it.tic)}
                  aria-pressed={sel}
                  title={`${it.tic} · ${it.name}\n${it.parent} › ${it.sub}\nWeight ${it.w.toFixed(2)}% of the fund\n${x.ret.period} return: ${v == null ? (x.ret.state === "loading" ? "loading…" : "N/A (no price history)") : fp(v)}`}
                  className="on-color absolute box-border overflow-hidden border border-[var(--oasis-panel)] text-left text-white transition-[filter,opacity] duration-200 hover:z-[2] hover:brightness-[1.18] focus-visible:z-[2] focus-visible:outline focus-visible:outline-1 focus-visible:outline-white"
                  style={{
                    left: tx, top: ty, width: w, height: h, background: bg, padding: `${big ? 5 : 2}px ${big ? 8 : 4}px`,
                    opacity: dim ? 0.22 : 1,
                    boxShadow: sel ? "inset 0 0 0 2px var(--oasis-accent), 0 0 10px color-mix(in srgb, var(--oasis-accent) 40%, transparent)" : undefined,
                    zIndex: sel ? 4 : undefined,
                  }}
                >
                  <div className="whitespace-nowrap font-display font-semibold leading-[1.05]" style={{ fontSize: fs, opacity: w < 24 || h < 14 ? 0 : 1 }}>{it.tic}</div>
                  <div className="whitespace-nowrap font-mono font-bold leading-[1.15]" style={{ fontSize: Math.max(9, fs * 0.5), opacity: w < 44 || h < 32 ? 0 : 0.9 }}>{second}</div>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ── Legend + coverage ─────────────────────────────────────── */

function Legend({ x, mode }: { x: Explorer; mode: Mode }) {
  if (mode === "COMPOSITION") {
    const share = new Map<string, number>();
    x.all.forEach((r) => share.set(r.parent, (share.get(r.parent) ?? 0) + r.w));
    const secs = [...share].sort((a, b) => b[1] - a[1]);
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 font-mono text-[10px]">
        <span className="mr-1 text-[9.5px] font-bold tracking-[0.14em] text-zinc-500">COLOUR = SECTOR · SIZE = WEIGHT</span>
        {secs.map(([p, v]) => {
          const on = x.filter === `sector:${p}`;
          return (
            <button key={p} type="button" onClick={() => x.setFilter(on ? "ALL" : `sector:${p}`)} aria-pressed={on} title={`${p}: ${v.toFixed(1)}% of the fund (listed holdings) — click to filter`}
              className={`flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 transition-colors ${on ? "oasis-on" : "border-transparent text-zinc-400 hover:border-white/[0.1] hover:text-zinc-100"}`}>
              <span className="h-2.5 w-2.5 rounded-[1px]" style={{ background: `rgb(${rgbOf(p)})` }} />{p} <span className="text-zinc-600">{v.toFixed(0)}%</span>
            </button>
          );
        })}
      </div>
    );
  }
  const sc = RET_SCALE[x.ret.period];
  const withData = x.all.filter((r) => r.r != null).length;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px]">
      <span className="text-[9.5px] font-bold tracking-[0.14em] text-zinc-500" title="Price return of each holding over the selected period (excludes dividends)">
        COLOUR = {x.ret.period} RETURN · SIZE = WEIGHT
      </span>
      <span className="flex items-center gap-1.5 tabular-nums text-zinc-500">
        −{sc}%
        <span className="h-2.5 w-36 rounded-[1px]" style={{ background: `linear-gradient(90deg, ${retColor(-sc, sc)}, ${retColor(-sc / 2, sc)}, #27272a, ${retColor(sc / 2, sc)}, ${retColor(sc, sc)})` }} />
        +{sc}%
      </span>
      <span className="flex items-center gap-1.5 text-zinc-500"><span className="h-2.5 w-3.5 rounded-[1px]" style={{ background: NA_BG }} />N/A</span>
      <span className="text-zinc-600">
        {x.ret.state === "loading" ? "loading price history…" : x.ret.state === "error" ? "some price requests failed" : `returns for ${withData}/${x.all.length} holdings · ${PERIOD_LABEL[x.ret.period]}`}
      </span>
    </div>
  );
}

function Coverage({ fund }: { fund: FundData }) {
  const listed = fund.holdings.filter((h) => h.w > 0);
  const nav = listed.reduce((a, h) => a + h.w, 0);
  const subset = listed.length < fund.positions;
  const odd = nav > 100.5;
  return (
    <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.06em] text-zinc-400"
      title={`Holdings in this map: ${listed.length}. The fund reports ${fund.positions} positions. Their weights add up to ${nav.toFixed(1)}% of net asset value.${odd ? " Weights exceed 100% — the profile weights are approximate." : ""}`}>
      {subset ? `TOP ${listed.length} OF ${fund.positions} HOLDINGS` : `ALL ${listed.length} HOLDINGS`} · <span className="text-zinc-100">{Math.min(nav, 100).toFixed(1)}% OF NAV</span>
      {subset && <span className="text-zinc-600"> · SUBSET</span>}
      {odd && <span className="text-amber-400/80"> · APPROX.</span>}
    </span>
  );
}

/* ── Collapsible panel ─────────────────────────────────────── */

const HEADER_H = 40;

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
      className="flex min-w-0 flex-col overflow-hidden oasis-glass border border-white/[0.06] bg-[var(--oasis-panel)]"
    >
      {expanded ? (
        <header className="flex h-10 flex-none items-center gap-3 border-b border-white/[0.06] pl-4 pr-1.5">
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
              className="flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 hover:bg-white/[0.06] hover:text-white"
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
          <span className="h-1.5 w-1.5 rounded-none bg-zinc-700 transition-colors group-hover:bg-emerald-400" />
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

/* ── Selected holding ──────────────────────────────────────── */

function SelectionBar({ x, onShowChart }: { x: Explorer; onShowChart: () => void }) {
  const r = x.selectedRow;
  if (!r) {
    return (
      <div className="flex h-7 flex-none items-center px-1 font-mono text-[10.5px] tracking-[0.06em] text-zinc-600">
        Click a tile or a table row to select a holding · click a sector name to filter
      </div>
    );
  }
  const plotted = x.plotted.has(r.tic);
  return (
    <div className="flex min-h-7 flex-none flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border border-oasis/30 bg-oasis-muted px-3 py-1 font-mono text-[11px] tabular-nums">
      <span className="text-[13px] font-bold text-white">{r.tic}</span>
      <span className="min-w-0 max-w-[260px] truncate font-display text-zinc-300">{r.name}</span>
      <span className="text-zinc-400"><span className="text-zinc-600">SECTOR </span>{r.parent} › {r.sub}</span>
      <span><span className="text-zinc-600">WEIGHT </span><span className="text-zinc-100">{r.w.toFixed(2)}%</span></span>
      <span><span className="text-zinc-600">MKT CAP </span><span className="text-zinc-100">{capF(r.cap)}</span></span>
      <span><span className="text-zinc-600">{x.ret.period} RETURN </span><RetCell v={r.r} state={x.ret.state} /></span>
      <span className="ml-auto flex items-center gap-1.5">
        <button type="button" onClick={() => { if (!plotted) x.plot(r.tic, true); onShowChart(); }}
          className="rounded-sm border border-white/[0.1] px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] text-zinc-200 hover:border-white/30 hover:text-white">
          {plotted ? "VIEW PERFORMANCE" : "+ COMPARE PERFORMANCE"}
        </button>
        <Link href={`/stock/${r.tic}`} className="rounded-sm border border-white/[0.1] px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] text-zinc-200 hover:border-white/30 hover:text-white">STOCK DEEP DIVE →</Link>
        <button type="button" onClick={() => x.select(null)} aria-label="Clear selection" title="Clear selection" className="flex h-5 w-5 items-center justify-center rounded-sm text-zinc-500 hover:bg-white/[0.08] hover:text-white">×</button>
      </span>
    </div>
  );
}

/* ── Workspace ─────────────────────────────────────────────── */

/** `main` = the line the holdings are compared against (default: the ETF itself; the portfolio passes its basket) */
/** `fill`: fit the parent's height with no scrolling (ETF deep view); without it the workspace uses fixed heights (portfolio page) */
export default function CompositionMap({ fund, main, fill = false }: { fund: FundData; main?: MainDef; fill?: boolean }) {
  const [mode, setMode] = useState<Mode>("COMPOSITION");
  const [period, setPeriod] = useState<CompPeriod>("1Y");
  const tickers = useMemo(() => fund.holdings.filter((h) => h.w > 0).map((h) => h.tic), [fund.holdings]);
  const { ret: rets, state } = useHoldingReturns(tickers, period);
  const ret = useMemo(() => ({ period, state, of: (tic: string) => rets[tic.toUpperCase()] ?? null }), [period, state, rets]);
  const x = useHoldingsExplorer(fund, ret);
  const [open, setOpen] = useState({ map: true, table: true, chart: false });
  const flip = (id: keyof typeof open) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const showChart = () => setOpen((o) => ({ ...o, chart: true }));

  return (
    <div className={`flex min-w-0 flex-col px-3 ${fill ? "gap-2 pb-6 pt-3 lg:h-full lg:min-h-0 lg:overflow-hidden lg:pb-3" : "flex-none gap-2.5 pb-6 pt-4"}`}>
      {/* Toolbar: mode · period · coverage */}
      <div className="oasis-glass flex flex-none flex-wrap items-center gap-x-4 gap-y-1.5 border border-white/[0.05] bg-[var(--oasis-panel)] px-3 py-1.5">
        <div role="tablist" aria-label="Map mode" className="flex flex-none rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] p-0.5">
          {(["COMPOSITION", "PERFORMANCE"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              title={m === "COMPOSITION" ? "What the ETF owns — colour by sector" : "How the holdings performed — colour by return over the period"}
              className={`h-7 rounded-sm px-3 font-mono text-[11px] font-bold tracking-[0.1em] ${mode === m ? "oasis-on" : "text-zinc-500 hover:text-zinc-200"}`}>{m}</button>
          ))}
        </div>
        <span className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <span className="font-mono text-[9.5px] font-bold tracking-[0.14em] text-zinc-500" title="Period for the table's return column, the performance colours and the Relative Performance chart">RETURN PERIOD</span>
          <SegRail items={RET_PERIODS} value={period} onChange={setPeriod} width={RET_PERIODS.length * 42} />
        </span>
        <span className="ml-auto"><Coverage fund={fund} /></span>
        <div className="w-full border-t border-white/[0.05] pt-1.5"><Legend x={x} mode={mode} /></div>
      </div>

      <SelectionBar x={x} onShowChart={showChart} />
      {x.filter !== "ALL" && (
        <div className="flex flex-none items-center gap-2 font-mono text-[10.5px]">
          <span className="text-zinc-500">FILTERED TO</span>
          <button type="button" onClick={() => x.setFilter("ALL")} className="oasis-on rounded-sm border px-2 py-0.5 font-bold tracking-[0.06em]">{x.filterLabel} ×</button>
          <button type="button" onClick={() => x.setFilter("ALL")} className="text-zinc-500 underline-offset-2 hover:text-white hover:underline">show full composition</button>
        </div>
      )}

      {/* Map (primary) | holdings table */}
      <div className={`flex gap-3 max-lg:h-auto max-lg:flex-col ${fill ? "min-h-[520px] lg:min-h-0 lg:flex-1" : "h-[calc(100dvh-360px)] min-h-[520px] flex-none"}`}>
        <div className="flex min-w-0 max-lg:h-[460px]" style={{ flex: open.map ? "1.4 1 0px" : "0 0 40px" }}>
          <Panel title="MAP" meta={mode === "COMPOSITION" ? "BY SECTOR" : `${period} RETURN`} weight={1} axis="x" expanded={open.map} onToggle={() => flip("map")}>
            <div className="h-full p-2"><HoldingsMap x={x} mode={mode} /></div>
          </Panel>
        </div>
        <div className="flex min-w-0 max-lg:h-[460px]" style={{ flex: open.table ? "1 1 0px" : "0 0 40px" }}>
          <Panel
            title="HOLDINGS"
            meta={`${x.rows.length}/${x.all.length} · Σ ${x.rows.reduce((a, r) => a + r.w, 0).toFixed(1)}%`}
            weight={1}
            axis="x"
            expanded={open.table}
            onToggle={() => flip("table")}
          >
            <ExplorerTable x={x} />
          </Panel>
        </div>
      </div>

      {/* Relative performance: contextual — collapsed until asked for (or a holding is sent to it) */}
      {/* fill: the open chart takes ~45% of the height and the map / table shrink — still no scrolling */}
      <div className="flex flex-none flex-col" style={{ height: open.chart ? (fill ? "45%" : 480) : HEADER_H }}>
        <Panel
          title={`RELATIVE PERFORMANCE · ${period}`}
          meta={`${main?.label ?? fund.tic} vs ${x.shown.length ? x.shown.map((h) => h.tic).join(", ") : "no holdings plotted"} · % FROM START OF WINDOW`}
          weight={1}
          expanded={open.chart}
          onToggle={() => flip("chart")}
        >
          <ExplorerChart x={x} onPeriod={setPeriod} main={main} />
        </Panel>
      </div>
    </div>
  );
}
