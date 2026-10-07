"use client";

import { useMemo, useState } from "react";
import type { FundData } from "./types";
import { binaryTreemap, hash01 } from "./utils";

type MapTf = "12M" | "6M" | "3M" | "1M" | "1D";
const MAP_TFS: MapTf[] = ["12M", "6M", "3M", "1M", "1D"];
/** [volatility scale, bias] per timeframe — placeholder; replace with real per-ticker returns. */
const SCALE: Record<MapTf, [number, number]> = { "12M": [50, 8], "6M": [30, 5], "3M": [20, 3], "1M": [10, 1.5], "1D": [3, 0.2] };
const W = 1000, H = 560;
const fp = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "%";

function tileColor(v: number, sc: number) {
  const a = Math.min(1, Math.abs(v) / sc);
  if (Math.abs(v) < sc * 0.04) return "radial-gradient(circle at 50% 50%,#4B5563,#1F2937)";
  const r = (n: number[]) => n.map(Math.round).join(",");
  return v >= 0
    ? `radial-gradient(circle at 50% 50%,rgb(${r([90 - a * 20, 130 + a * 90, 90 - a * 50])}),rgb(${r([28, 70 + a * 60, 36])}))`
    : `radial-gradient(circle at 50% 50%,rgb(${r([150 + a * 105, 60 - a * 10, 90 - a * 15])}),rgb(${r([100 + a * 50, 28, 46 + a * 4])}))`;
}

type SortKey = "rank" | "tic" | "name" | "sub" | "w" | "cap";
const HEAD: [string, SortKey, "left" | "right"][] = [
  ["#", "rank", "left"], ["TICKER", "tic", "left"], ["COMPANY NAME", "name", "left"], ["SECTOR", "sub", "left"], ["WEIGHT", "w", "left"], ["MARKET CAP", "cap", "right"],
];
const GRID = "grid grid-cols-[36px_70px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_96px] items-center gap-3 px-3.5";
const capF = (v: number) => (v <= 0 ? "—" : v >= 1000 ? "$" + (v / 1000).toFixed(2) + "T" : "$" + v.toFixed(0) + "B");

function HoldingsMap({ fund }: { fund: FundData }) {
  const [tf, setTf] = useState<MapTf>("1D");
  const [sc, bias] = SCALE[tf];
  const items = useMemo(
    () => fund.holdings.filter((x) => x.w > 0).map((x) => ({ ...x, v: (hash01(x.tic + tf) * 2 - 1) * sc * 0.8 + bias * 0.5 })),
    [fund.holdings, tf, sc, bias]
  );
  const tiles = useMemo(() => binaryTreemap(items, (i) => i.w, 0, 0, W, H), [items]);

  return (
    <div className="m-3 mb-3 mt-6 flex flex-none flex-col gap-3 font-mono">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="font-display text-xs font-bold tracking-[0.18em] text-neutral-300">COMPOSITION MAP</span>
        <span className="text-[10px] tracking-[0.08em] text-gray-500">{tf} PERFORMANCE · TOP {items.length} HOLDINGS · {items.reduce((a, z) => a + z.w, 0).toFixed(1)}% OF FUND</span>
      </div>
      <div className="relative h-[560px] overflow-hidden rounded-[18px] border border-white/[0.04] bg-[#0a0a0c] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
        {tiles.map(({ item: it, x, y, w, h }) => {
          const m = Math.min(w, h), big = w > 150 && h > 100, fs = Math.max(9, Math.min(46, m / 5.2));
          return (
            <div
              key={it.tic}
              title={`${it.name} · ${it.w.toFixed(2)}% weight · ${fp(it.v)}`}
              className="absolute box-border cursor-default overflow-hidden border border-[#0a0a0c] text-white transition-[filter] duration-200 hover:z-[2] hover:brightness-[1.18]"
              style={{ left: (x / W) * 100 + "%", top: (y / H) * 100 + "%", width: (w / W) * 100 + "%", height: (h / H) * 100 + "%", background: tileColor(it.v, sc), padding: `${big ? 8 : 5}px ${big ? 10 : 6}px` }}
            >
              <div className="whitespace-nowrap font-display font-semibold leading-[1.05]" style={{ fontSize: fs }}>{it.tic}</div>
              <div className="whitespace-nowrap font-bold leading-[1.15]" style={{ fontSize: Math.max(9, fs * 0.55), opacity: w < 46 || h < 30 ? 0 : 0.92 }}>{fp(it.v)}</div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[9.5px] tracking-[0.1em] text-gray-600">TILE AREA = WEIGHT IN {fund.tic} · COLOR = PRICE CHANGE · PLACEHOLDER DATA</span>
        <div className="flex gap-1.5">
          {MAP_TFS.map((k) => (
            <button key={k} type="button" onClick={() => setTf(k)} className={`flex h-7 min-w-11 items-center justify-center rounded-full px-3 text-[11px] font-bold hover:bg-white/[0.12] ${k === tf ? "bg-white/[0.14] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]" : "bg-white/5 text-gray-400"}`}>{k}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

const LEVEL_STYLE = {
  CRITICAL: {
    box: "border-[#ff6a00] bg-[#ff6a00]/[0.06] shadow-[0_0_16px_rgba(255,106,0,0.22),inset_0_0_12px_rgba(255,106,0,0.06)]",
    icon: "text-[#ff6a00] [text-shadow:0_0_8px_rgba(255,106,0,0.8)]", text: "text-[#ffb27a]", label: "text-[#ff8a3d]",
  },
  ELEVATED: {
    box: "border-amber-500/70 bg-amber-500/[0.05] shadow-[0_0_14px_rgba(245,158,11,0.15)]",
    icon: "text-amber-400", text: "text-amber-200/80", label: "text-amber-400",
  },
  LOW: {
    box: "border-emerald-400/50 bg-emerald-400/[0.05] shadow-[0_0_14px_rgba(52,211,153,0.12)]",
    icon: "text-emerald-400", text: "text-emerald-200/80", label: "text-emerald-400",
  },
} as const;

function HoldingsTable({ fund }: { fund: FundData }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [dir, setDir] = useState<1 | -1>(1);

  const all = useMemo(
    () => fund.holdings.map((x, i) => { const m = fund.holdingMeta[x.tic] ?? { sector: "Other", capB: 0 }; return { ...x, rank: i + 1, sub: m.sector, cap: m.capB }; }),
    [fund]
  );
  const subs = useMemo(() => Array.from(new Set(all.map((x) => x.sub))), [all]);
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return all
      .filter((x) => (filter === "ALL" || x.sub === filter) && (!qq || x.tic.toLowerCase().includes(qq) || x.name.toLowerCase().includes(qq)))
      .sort((a, b) => { const va = a[sortKey], vb = b[sortKey]; return (typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * dir; });
  }, [all, q, filter, sortKey, dir]);

  const mx = all[0].w, top5 = all.slice(0, 5).reduce((a, x) => a + x.w, 0);
  const parentShare: Record<string, number> = {};
  fund.sectors.forEach(([n, v]) => { const p = fund.sectorParent[n] ?? "Other"; parentShare[p] = (parentShare[p] ?? 0) + v; });
  const [topParent, topParentPct] = Object.entries(parentShare).sort((a, b) => b[1] - a[1])[0];
  const chips = [`SECTOR SKEW: ${topParentPct.toFixed(0)}% ${topParent}`, `SUB-INDUSTRY: ${fund.sectors[0][1].toFixed(0)}% ${fund.sectors[0][0]}`];
  const level = top5 >= 40 ? "CRITICAL" : top5 >= 22 ? "ELEVATED" : "LOW";
  const singleAsset = all.filter((x) => x.w >= 1).length === 1;
  const levelText =
    singleAsset ? "This is a single-asset fund: its price tracks the underlying directly."
    : level === "CRITICAL" ? "You are highly exposed to single-stock volatility."
    : level === "ELEVATED" ? "Single-stock risk is meaningful but diversified."
    : "Single-stock risk is well diversified.";

  const sortBy = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setDir(k === "w" || k === "cap" ? -1 : 1); }
  };
  const exportCsv = () => {
    const csv = "rank,ticker,company,sector,weight_pct,market_cap_usd_b\n" + rows.map((x) => [x.rank, x.tic, `"${x.name}"`, x.sub, x.w, x.cap].join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${fund.tic}_holdings.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="m-3 mt-6 flex flex-none flex-col gap-3 font-mono tabular-nums">
      <div className={`flex items-center gap-3 border px-3.5 py-2.5 ${LEVEL_STYLE[level].box}`}>
        <span className={`flex-none text-[15px] ${LEVEL_STYLE[level].icon}`}>{level === "LOW" ? "✓" : "⚠"}</span>
        <span className={`text-pretty text-xs leading-[1.45] ${LEVEL_STYLE[level].text}`}>
          <span className={`font-bold tracking-[0.08em] ${LEVEL_STYLE[level].label}`}>{level} CONCENTRATION:</span> The Top 5 holdings account for <span className="font-bold text-white">{top5.toFixed(1)}%</span> of this portfolio. {levelText}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => <span key={c} className="flex h-6 items-center gap-1.5 whitespace-nowrap border border-amber-500/60 bg-amber-500/[0.07] px-2.5 text-[10.5px] font-bold tracking-[0.08em] text-amber-500">⚠ {c}</span>)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-1">
        <label className="flex h-8 min-w-[220px] flex-[0_1_360px] items-center gap-2 rounded-xl border border-white/[0.03] bg-black/30 px-2.5 focus-within:border-gray-700">
          <span className="text-[11px] font-bold text-gray-500">Q</span>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${all.length} holdings...`} className="min-w-0 flex-1 border-0 bg-transparent font-mono text-[11.5px] text-neutral-200 outline-none" />
        </label>
        <div className="flex items-center gap-2">
          <label className="relative flex h-8 items-center whitespace-nowrap rounded-xl border border-white/[0.03] bg-black/30 pl-2.5 pr-7 text-[10.5px] font-bold tracking-[0.08em] text-gray-300 hover:border-gray-700">
            <span>[ FILTER: {filter === "ALL" ? "ALL SECTORS" : filter.toUpperCase()} ]</span>
            <span className="absolute right-2.5 text-gray-500">▾</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
              <option value="ALL">ALL SECTORS</option>
              {subs.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <button type="button" onClick={exportCsv} className="flex h-8 items-center whitespace-nowrap border border-emerald-400 px-3 text-[10.5px] font-bold tracking-[0.1em] text-emerald-400 hover:bg-emerald-400 hover:text-black hover:shadow-[0_0_14px_rgba(52,211,153,0.5)]">[ ↓ EXPORT .CSV ]</button>
        </div>
      </div>

      <div className="max-h-[600px] overflow-y-auto rounded-[18px] border border-white/[0.04] bg-[#121214] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
        <div className={`sticky top-0 z-[2] h-8 border-b border-gray-700 bg-[#0a0a0a] text-[9.5px] font-bold tracking-[0.14em] text-gray-500 ${GRID}`}>
          {HEAD.map(([l, k, al]) => (
            <button key={k} type="button" onClick={() => sortBy(k)} className={`cursor-pointer whitespace-nowrap hover:text-white ${al === "right" ? "text-right" : "text-left"} ${sortKey === k ? "text-emerald-400" : ""}`}>
              {l}{sortKey === k ? (dir > 0 ? " ▲" : " ▼") : ""}
            </button>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.tic} className={`h-[30px] border-b border-white/[0.06] text-[11.5px] hover:bg-[#0d0d0d] ${GRID}`}>
            <span className="text-gray-600">{String(r.rank).padStart(2, "0")}</span>
            <span className="font-bold text-white">{r.tic}</span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap font-display text-xs text-gray-300">{r.name}</span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] tracking-[0.04em] text-gray-400">{r.sub}</span>
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="w-[46px] flex-none text-right font-semibold text-neutral-100">{r.w.toFixed(2)}%</span>
              <div className="h-[3px] flex-1 bg-gray-900"><div className="h-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" style={{ width: ((r.w / mx) * 100).toFixed(1) + "%" }} /></div>
            </div>
            <span className="text-right text-gray-300">{capF(r.cap)}</span>
          </div>
        ))}
        {rows.length === 0 && <div className="p-8 text-center text-[11px] tracking-[0.14em] text-gray-600">NO MATCHING HOLDINGS</div>}
      </div>
      <div className="flex justify-between gap-3 text-[9.5px] tracking-[0.1em] text-gray-600">
        <span>{rows.length} / {all.length} ROWS · Σ WEIGHT {rows.reduce((a, x) => a + x.w, 0).toFixed(2)}%</span>
        <span>SOURCE: ISSUER FILING · 2026-09-25</span>
      </div>
    </div>
  );
}

export default function CompositionMap({ fund }: { fund: FundData }) {
  return (
    <>
      <HoldingsMap fund={fund} />
      <HoldingsTable fund={fund} />
    </>
  );
}
