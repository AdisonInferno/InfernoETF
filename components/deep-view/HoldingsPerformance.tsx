"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import InfernoChart, { type MainDef } from "@/components/InfernoChart";
import { SUB_PARENT } from "@/lib/fund-profiles";
import type { FundData } from "./types";
import { RET_PERIODS, type CompPeriod, type RetState } from "./useHoldingReturns";

/* ─────────────────────────────────────────────────────────────
   Holdings Explorer  (COMPOSITION MAP tab)
   useHoldingsExplorer() owns the state shared by the treemap, the holdings table and the
   Relative Performance chart: ONE selected holding, ONE sector filter, the plotted lines and
   the return period. <ExplorerTable> and <ExplorerChart> are panel bodies laid out by CompositionMap.
   Clicking a row selects it (same as clicking its tile); the ☐ box plots it on the chart (max 6).
   Returns come from real price history (useHoldingReturns); missing ones stay N/A.
   ───────────────────────────────────────────────────────────── */

const MAX_LINES = 6;
/** Series colours handed out in order to newly plotted tickers. */
const PALETTE = ["#34d399", "#60a5fa", "#94a3b8", "#fbbf24", "#fb7185", "#22d3ee"];

const signed = (v: number, d = 2) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d) + "%";
const capF = (v: number) => (v <= 0 ? "—" : v >= 1000 ? "$" + (v / 1000).toFixed(2) + "T" : "$" + v.toFixed(0) + "B");

type SortKey = "rank" | "tic" | "name" | "sub" | "w" | "cap" | "r";
const HEAD: [string, SortKey, "left" | "right"][] = [
  ["TICKER", "tic", "left"], ["COMPANY NAME", "name", "left"], ["SECTOR", "sub", "left"],
  ["WEIGHT", "w", "left"], ["MARKET CAP", "cap", "right"], ["RETURN", "r", "right"],
];
const GRID = "grid grid-cols-[26px_56px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(92px,1fr)_66px_76px] items-center gap-2.5 px-3";

const LEVEL_STYLE = {
  CRITICAL: { box: "border-[#ff6a00] bg-[#ff6a00]/[0.06]", icon: "text-[#ff6a00]", text: "text-[#ffb27a]", label: "text-[#ff8a3d]" },
  ELEVATED: { box: "border-amber-500/70 bg-amber-500/[0.05]", icon: "text-amber-400", text: "text-amber-200/80", label: "text-amber-400" },
  LOW: { box: "border-emerald-400/50 bg-emerald-400/[0.05]", icon: "text-emerald-400", text: "text-emerald-200/80", label: "text-emerald-400" },
} as const;

export interface Row { rank: number; tic: string; name: string; w: number; sub: string; parent: string; cap: number; r: number | null }
/** "ALL" · "sector:<parent>" · "sub:<sub-sector>" */
export type SectorFilter = string;
export interface RetInfo { period: CompPeriod; of: (tic: string) => number | null; state: RetState }

/* ── State ─────────────────────────────────────────────────── */

export function useHoldingsExplorer(fund: FundData, ret: RetInfo) {
  const parentOf = useMemo(() => (sub: string) => fund.sectorParent[sub] ?? SUB_PARENT[sub] ?? "Other", [fund]);
  const base = useMemo<Omit<Row, "r">[]>(() => fund.holdings.map((h, i) => {
    const m = fund.holdingMeta[h.tic] ?? { sector: "Other", capB: 0 };
    return { rank: i + 1, tic: h.tic, name: h.name, w: h.w, sub: m.sector, parent: parentOf(m.sector), cap: m.capB };
  }), [fund, parentOf]);
  const all = useMemo<Row[]>(() => base.map((r) => ({ ...r, r: ret.state === "loading" ? null : ret.of(r.tic) })), [base, ret]);

  // Plotted tickers → colour. Default: two largest holdings.
  const [plotted, setPlotted] = useState<Map<string, string>>(() => new Map(base.slice(0, 2).map((h, i) => [h.tic, PALETTE[i]])));
  const [limitHit, setLimitHit] = useState(false);
  /** the one selected holding — shared by the treemap, the table and the detail bar */
  const [selected, setSelected] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<SectorFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [dir, setDir] = useState<1 | -1>(1);

  const plot = (tic: string, on?: boolean) => {
    const has = plotted.has(tic);
    if (on === has) return;
    const next = new Map(plotted);
    if (has) { next.delete(tic); setLimitHit(false); }
    else if (next.size >= MAX_LINES) { setLimitHit(true); return; }
    else {
      const used = new Set(next.values());
      next.set(tic, PALETTE.find((c) => !used.has(c)) ?? PALETTE[0]);
    }
    setPlotted(next);
  };
  const toggle = (tic: string) => plot(tic);
  const clearAll = () => { setPlotted(new Map()); setLimitHit(false); };
  const select = (tic: string | null) => setSelected((s) => (tic === s ? null : tic));

  /* Alerts */
  const top5 = base.slice(0, 5).reduce((a, x) => a + x.w, 0);
  const parentShare: Record<string, number> = {};
  fund.sectors.forEach(([n, v]) => { const p = fund.sectorParent[n] ?? "Other"; parentShare[p] = (parentShare[p] ?? 0) + v; });
  const [topParent, topParentPct] = Object.entries(parentShare).sort((a, b) => b[1] - a[1])[0];
  const chips = [`SECTOR SKEW: ${topParentPct.toFixed(0)}% ${topParent}`, `SUB-INDUSTRY: ${fund.sectors[0][1].toFixed(0)}% ${fund.sectors[0][0]}`];
  const level = top5 >= 40 ? "CRITICAL" : top5 >= 22 ? "ELEVATED" : "LOW";
  const singleAsset = base.filter((x) => x.w >= 1).length === 1;
  const levelText =
    singleAsset ? "This is a single-asset fund: its price tracks the underlying directly."
    : level === "CRITICAL" ? "You are highly exposed to single-stock volatility."
    : level === "ELEVATED" ? "Single-stock risk is meaningful but diversified."
    : "Single-stock risk is well diversified.";
  const ls = LEVEL_STYLE[level];

  /* Filter shared by map + table */
  const parents = useMemo(() => Array.from(new Set(base.map((x) => x.parent))), [base]);
  const subs = useMemo(() => Array.from(new Set(base.map((x) => x.sub))), [base]);
  const inFilter = useMemo(() => (r: { sub: string; parent: string }) =>
    filter === "ALL" || filter === `sector:${r.parent}` || filter === `sub:${r.sub}`, [filter]);
  const filterLabel = filter === "ALL" ? "ALL SECTORS" : filter.slice(filter.indexOf(":") + 1).toUpperCase();

  /* Table */
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return all
      .filter((x) => inFilter(x) && (!qq || x.tic.toLowerCase().includes(qq) || x.name.toLowerCase().includes(qq)))
      .sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey];
        if (va == null || vb == null) return va == null && vb == null ? a.rank - b.rank : va == null ? 1 : -1; // N/A always last
        return (typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * dir;
      });
  }, [all, q, inFilter, sortKey, dir]);
  const maxW = base[0]?.w ?? 1;
  const sortBy = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setDir(k === "w" || k === "cap" || k === "r" ? -1 : 1); }
  };
  const exportCsv = () => {
    const csv = `rank,ticker,company,sector,sub_sector,weight_pct,market_cap_usd_b,return_${ret.period.toLowerCase()}_pct\n` +
      rows.map((x) => [x.rank, x.tic, `"${x.name}"`, `"${x.parent}"`, `"${x.sub}"`, x.w, x.cap, x.r == null ? "" : x.r.toFixed(2)].join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${fund.tic}_holdings.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  };

  const shown = all.filter((h) => plotted.has(h.tic));
  const selectedRow = all.find((r) => r.tic === selected) ?? null;

  return {
    fund, all, rows, ret, parents, subs, maxW, shown, plotted, limitHit, toggle, plot, clearAll,
    selected, selectedRow, select, q, setQ, filter, setFilter, inFilter, filterLabel, sortKey, dir, sortBy, exportCsv,
    alert: { level, levelText, top5, chips, ls },
  };
}

export type Explorer = ReturnType<typeof useHoldingsExplorer>;

/** Return cell text: loading / failed request / no data for this holding / value */
export function RetCell({ v, state, className = "" }: { v: number | null; state: RetState; className?: string }) {
  if (state === "loading") return <span className={`text-zinc-600 ${className}`} title="Loading price history…">···</span>;
  if (v == null) {
    return state === "error"
      ? <span className={`text-amber-400/80 ${className}`} title="Price request failed — try again later">ERR</span>
      : <span className={`text-zinc-600 ${className}`} title="No price history for this symbol over the selected period">N/A</span>;
  }
  return <span className={`${v >= 0 ? "text-emerald-400" : "text-red-400"} ${className}`}>{signed(v)}</span>;
}

/* ── Panel bodies ──────────────────────────────────────────── */

/** Alerts + toolbar + master table. Fills its panel; only the table rows scroll. */
export function ExplorerTable({ x }: { x: Explorer }) {
  const { alert: a } = x;
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  // a tile clicked in the map brings its row into view
  useEffect(() => { if (x.selected) rowRefs.current.get(x.selected)?.scrollIntoView({ block: "nearest" }); }, [x.selected]);
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 px-3 pb-2.5 pt-2 font-mono tabular-nums">
      {/* Toolbar + alerts — one wrapping row */}
      <div className="flex flex-none flex-wrap items-center gap-2">
        <label className="flex h-7 min-w-[160px] flex-[0_1_240px] items-center gap-2 rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] px-2.5 focus-within:border-zinc-700">
          <span className="text-[11px] font-bold text-zinc-500">Q</span>
          <input type="text" value={x.q} onChange={(e) => x.setQ(e.target.value)} placeholder={`Search ${x.all.length} holdings...`} className="min-w-0 flex-1 border-0 bg-transparent font-mono text-[11.5px] text-neutral-200 outline-none" />
        </label>
        <span className={`flex h-7 min-w-0 items-center gap-2 border px-2.5 text-[10.5px] ${a.ls.box}`} title={a.levelText}>
          <span className={a.ls.icon}>{a.level === "LOW" ? "✓" : "⚠"}</span>
          <span className={`whitespace-nowrap font-bold tracking-[0.08em] ${a.ls.label}`}>{a.level} CONCENTRATION</span>
          <span className={`whitespace-nowrap ${a.ls.text}`}>TOP 5 = <span className="font-bold text-white">{a.top5.toFixed(1)}%</span></span>
        </span>
        {a.chips.map((c) => (
          <span key={c} className="flex h-7 items-center whitespace-nowrap border border-amber-500/60 bg-amber-500/[0.07] px-2.5 text-[10.5px] font-bold tracking-[0.08em] text-amber-500">⚠ {c}</span>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <label className="relative flex h-7 items-center whitespace-nowrap rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] pl-2.5 pr-7 text-[10.5px] font-bold tracking-[0.08em] text-zinc-300 hover:border-zinc-700">
            <span>[ FILTER: {x.filterLabel} ]</span>
            <span className="absolute right-2.5 text-zinc-500">▾</span>
            <select value={x.filter} onChange={(e) => x.setFilter(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
              <option value="ALL">ALL SECTORS</option>
              <optgroup label="SECTOR">{x.parents.map((s) => <option key={s} value={`sector:${s}`}>{s}</option>)}</optgroup>
              <optgroup label="SUB-SECTOR">{x.subs.map((s) => <option key={s} value={`sub:${s}`}>{s}</option>)}</optgroup>
            </select>
          </label>
          <button type="button" onClick={x.exportCsv} className="flex h-7 items-center whitespace-nowrap border border-emerald-400 px-3 text-[10.5px] font-bold tracking-[0.1em] text-emerald-400 hover:bg-emerald-400 hover:text-black">[ ↓ .CSV ]</button>
        </span>
      </div>

      {/* Table — inner scroll */}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)]/40 [scrollbar-color:#27272a_transparent] [scrollbar-width:thin]">
        <div className="min-w-[580px]">
          <div className={`sticky top-0 z-[2] h-8 border-b border-white/[0.06] bg-[var(--oasis-panel)] text-[9.5px] font-bold tracking-[0.14em] text-zinc-500 ${GRID}`}>
            <span className="text-center" title="Plot on the Relative Performance chart">◫</span>
            {HEAD.map(([l, k, al]) => (
              <button key={k} type="button" onClick={() => x.sortBy(k)} className={`whitespace-nowrap hover:text-white ${al === "right" ? "text-right" : "text-left"} ${x.sortKey === k ? "text-emerald-400" : ""}`}>
                {k === "r" ? `${x.ret.period} ${l}` : l}{x.sortKey === k ? (x.dir > 0 ? " ▲" : " ▼") : ""}
              </button>
            ))}
          </div>
          {x.rows.map((r) => {
            const c = x.plotted.get(r.tic), on = c !== undefined;
            const full = !on && x.plotted.size >= MAX_LINES;
            const sel = x.selected === r.tic;
            return (
              <div
                key={r.tic}
                ref={(el) => { if (el) rowRefs.current.set(r.tic, el); else rowRefs.current.delete(r.tic); }}
                role="row"
                aria-selected={sel}
                tabIndex={0}
                onClick={() => x.select(r.tic)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); x.select(r.tic); }
                  if (e.key === " ") { e.preventDefault(); x.toggle(r.tic); }
                }}
                title="Click to select (highlights it on the map) · Space or ☐ to plot"
                className={`h-[30px] cursor-pointer border-b border-white/[0.06] text-[11.5px] transition-colors last:border-b-0 hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none ${sel ? "bg-oasis-muted" : on ? "bg-white/[0.015]" : ""} ${GRID}`}
                style={sel ? { boxShadow: "inset 3px 0 0 var(--oasis-accent)" } : on ? { boxShadow: `inset 2px 0 0 ${c}` } : undefined}
              >
                <span className="flex justify-center">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-disabled={full}
                    aria-label={`${on ? "Hide" : "Plot"} ${r.tic} on chart`}
                    onClick={(e) => { e.stopPropagation(); x.toggle(r.tic); }}
                    className={`flex h-4 w-4 items-center justify-center rounded-xs border transition-colors ${full ? "opacity-30" : "hover:border-zinc-400"}`}
                    style={{ borderColor: on ? c : "#3f3f46", background: on ? c : "transparent" }}
                  >
                    {on && (
                      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
                        <path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="#030303" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </span>
                <span className="font-bold" style={{ color: on ? c : "var(--color-white)" }}>{r.tic}</span>
                <span className="truncate font-display text-xs text-zinc-300">{r.name}</span>
                <span className="truncate text-[10.5px] tracking-[0.04em] text-zinc-400" title={`${r.parent} › ${r.sub}`}>{r.sub}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-[46px] flex-none text-right font-semibold text-neutral-100">{r.w.toFixed(2)}%</span>
                  <span className="h-[3px] flex-1 bg-white/[0.06]">
                    <span className="block h-full" style={{ width: ((r.w / x.maxW) * 100).toFixed(1) + "%", background: on ? c : "#52525b" }} />
                  </span>
                </span>
                <span className="text-right text-zinc-300">{capF(r.cap)}</span>
                <RetCell v={r.r} state={x.ret.state} className="text-right font-semibold" />
              </div>
            );
          })}
          {x.rows.length === 0 && <div className="p-3 text-center text-[11px] tracking-[0.14em] text-zinc-600">NO MATCHING HOLDINGS</div>}
        </div>
      </div>
    </div>
  );
}

/** Relative performance of the ETF and the plotted holdings — the shared terminal chart (real prices),
 *  in % mode so every line starts at 0% at the left edge. Its timeframe rail IS the Composition Map period. */
export function ExplorerChart({ x, onPeriod, main }: { x: Explorer; onPeriod: (p: CompPeriod) => void; main?: MainDef }) {
  const { fund, shown, plotted } = x;
  const pinned = useMemo(() => shown.map((h) => ({ id: `h:${h.tic}`, label: h.tic, sym: h.tic, color: plotted.get(h.tic) ?? PALETTE[0] })), [shown, plotted]);
  const picker = useMemo(() => fund.holdings.map((h) => ({ sym: h.tic, label: h.tic, sub: `${h.w.toFixed(2)}% · ${h.name}` })), [fund.holdings]);
  return (
    <div className="flex h-full min-h-0 flex-col px-2 pb-2.5 pt-2 font-mono tabular-nums sm:px-3">
      <div className="min-h-0 flex-1">
        <InfernoChart key={fund.tic}
          main={main ?? { id: fund.tic, label: fund.tic, sym: fund.tic, color: "#f4f4f5" }}
          pinned={pinned} picker={picker} initialUnit="PCT"
          tfs={RET_PERIODS} tf={x.ret.period} onTfChange={(t) => onPeriod(t as CompPeriod)} />
      </div>
      <div className="mt-1.5 flex flex-none flex-wrap items-center gap-3 border-t border-white/[0.06] px-1 pt-2 text-[10px] tracking-[0.1em]">
        <span className="text-zinc-600">Tick ☐ in the holdings table to add or remove a line · click a legend entry to hide it</span>
        <span className="ml-auto flex items-center gap-3">
          <span className={x.limitHit ? "text-amber-400" : "text-zinc-600"}>
            {x.limitHit ? `MAX ${MAX_LINES} LINES · REMOVE ONE FIRST` : `${shown.length}/${MAX_LINES} PLOTTED`}
          </span>
          {shown.length > 0 && (
            <button type="button" onClick={x.clearAll} className="rounded-sm px-2 py-1 font-bold text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-100">CLEAR ALL</button>
          )}
        </span>
      </div>
    </div>
  );
}
