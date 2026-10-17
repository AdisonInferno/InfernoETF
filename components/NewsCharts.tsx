"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/* Charts of the instruments a news item is about — opened under the news card.
   Each mini chart marks the publication time and shows the move since then. */

type S = { t: number[]; c: number[] } | null;

const COMMODITY_PROXY: Record<string, string[]> = {
  Oil: ["USO", "XLE"], Gas: ["UNG", "XLE"], Gold: ["GLD", "GDX"], Silver: ["SLV"], Copper: ["CPER", "XLB"],
  "Rare earths": ["REMX"], "Gallium/Germanium": ["REMX", "SMH"], Lithium: ["LIT"], "Nickel/Cobalt": ["XLB"],
  Titanium: ["ITA"], Aluminium: ["XLB"], Steel: ["SLX"], Uranium: ["URA"], "Helium/Neon": ["SMH"], Commodities: ["DBC"],
};
export const proxiesFor = (commodity: string) => COMMODITY_PROXY[commodity] ?? ["DBC"];

function Mini({ sym, s, ts }: { sym: string; s: S; ts: number }) {
  if (!s) return (
    <div className="flex h-[92px] flex-col justify-between rounded-sm border border-white/[0.06] bg-[var(--oasis-panel)] p-2">
      <span className="text-[11px] font-bold text-zinc-300">{sym}</span>
      <span className="text-[10px] text-zinc-600">no price data</span>
    </div>
  );
  const W = 200, H = 54;
  const lo = Math.min(...s.c), hi = Math.max(...s.c), rg = hi - lo || 1;
  const t0 = s.t[0], t1 = s.t[s.t.length - 1];
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (v: number) => H - 3 - ((v - lo) / rg) * (H - 6);
  // price at publication = last close at or before the news
  let i0 = s.t.findIndex((t) => t > ts) - 1;
  if (i0 < 0) i0 = ts >= t1 ? s.t.length - 1 : 0;
  const p0 = s.c[i0], last = s.c[s.c.length - 1];
  const since = ((last - p0) / p0) * 100;
  const up = since >= 0;
  const mx = Math.max(0, Math.min(W, x(ts)));
  return (
    <Link href={`/etf/${sym}`} className="flex flex-col gap-1 rounded-sm border border-white/[0.06] bg-[var(--oasis-panel)] p-2 transition-colors hover:border-white/[0.14]">
      <span className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
        <span className="font-bold text-zinc-100">{sym}</span>
        <span className="text-zinc-400">${last.toFixed(2)}</span>
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[54px] w-full" preserveAspectRatio="none" aria-hidden>
        <line x1={mx} x2={mx} y1="0" y2={H} stroke="#f59e0b" strokeOpacity="0.6" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        <polyline points={s.t.map((t, i) => `${x(t).toFixed(1)},${y(s.c[i]).toFixed(1)}`).join(" ")} fill="none" stroke={up ? "#34d399" : "#fb7185"} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        <circle cx={x(s.t[i0])} cy={y(p0)} r="2.2" fill="#f59e0b" />
      </svg>
      <span className="flex justify-between text-[10px] tabular-nums">
        <span className="text-zinc-600">since news</span>
        <span className={`font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}>{up ? "+" : ""}{since.toFixed(2)}%</span>
      </span>
    </Link>
  );
}

export default function NewsCharts({ symbols, ts }: { symbols: string[]; ts: number }) {
  const syms = [...new Set(symbols.map((s) => s.toUpperCase()))].slice(0, 4);
  const key = syms.join(",");
  const [data, setData] = useState<{ key: string; series: Record<string, S> } | null>(null);
  useEffect(() => {
    let off = false;
    const range = Date.now() / 1000 - ts > 20 * 86400 ? "3mo" : "1mo";
    fetch(`/api/prices?symbols=${key}&range=${range}`)
      .then((r) => r.json())
      .then((j: { series: Record<string, S> }) => { if (!off) setData({ key, series: j.series }); })
      .catch(() => { if (!off) setData({ key, series: {} }); });
    return () => { off = true; };
  }, [key, ts]);
  const ready = data?.key === key;
  return (
    <div className="grid grid-cols-2 gap-1.5 pt-1 font-mono xl:grid-cols-4">
      {syms.map((s) => (ready ? <Mini key={s} sym={s} s={data!.series[s] ?? null} ts={ts} /> : <div key={s} className="h-[92px] animate-pulse rounded-sm bg-white/[0.03]" />))}
    </div>
  );
}
