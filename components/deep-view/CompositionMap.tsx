"use client";

import { useMemo, useState } from "react";
import type { FundData } from "./types";
import { binaryTreemap, hash01 } from "./utils";
import HoldingsExplorer from "./HoldingsPerformance";

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

function HoldingsMap({ fund }: { fund: FundData }) {
  const [tf, setTf] = useState<MapTf>("1D");
  const [sc, bias] = SCALE[tf];
  const items = useMemo(
    () => fund.holdings.filter((x) => x.w > 0).map((x) => ({ ...x, v: (hash01(x.tic + tf) * 2 - 1) * sc * 0.8 + bias * 0.5 })),
    [fund.holdings, tf, sc, bias]
  );
  const tiles = useMemo(() => binaryTreemap(items, (i) => i.w, 0, 0, W, H), [items]);

  return (
    <div className="flex flex-none flex-col gap-3 font-mono">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="font-display text-xs font-bold tracking-[0.18em] text-neutral-300">COMPOSITION MAP</span>
        <span className="text-[10px] tracking-[0.08em] text-gray-500">{tf} PERFORMANCE · TOP {items.length} HOLDINGS · {items.reduce((a, z) => a + z.w, 0).toFixed(1)}% OF FUND</span>
      </div>
      <div className="relative h-[560px] overflow-hidden rounded-[18px] border border-white/[0.04] bg-[#0a0a0c]">
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

export default function CompositionMap({ fund }: { fund: FundData }) {
  return (
    <div className="flex flex-none flex-col gap-6 px-3 pb-12 pt-6">
      {/* 1. Map → 2. Master table → 3. Relative-performance chart */}
      <HoldingsMap fund={fund} />
      <HoldingsExplorer fund={fund} />
    </div>
  );
}
