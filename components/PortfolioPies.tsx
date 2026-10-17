"use client";

/* Portfolio composition at a glance:
   · SECTORS donut — click it to open the "pizza": it grows and an outer ring shows the
     sub-sectors inside every sector (all sectors stay visible, each slice split into its parts)
   · HOLDINGS donut — the positions by weight (same colours as everywhere else)
   · table on the right: % of the portfolio per sector (+ its biggest sub-sectors when open). */

import { useMemo, useState } from "react";
import { sectorExposure, type Position } from "@/lib/portfolio";
import { SEG_COLORS } from "@/components/PortfolioDeepView";

const SECTOR_COLORS = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#fb923c", "#22d3ee", "#4ade80", "#e879f9", "#f87171", "#94a3b8", "#facc15"];

interface Slice { key: string; label: string; v: number; color: string }

/** SVG ring segment between radii r0 → r1 from angle a0 → a1 (radians, 0 = 12 o'clock) */
function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const big = a1 - a0 > Math.PI ? 1 : 0;
  const p = (r: number, a: number) => `${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)}`;
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
  return `M ${p(r1, a0)} A ${r1} ${r1} 0 ${big} 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 ${big} 0 ${p(r0, a0)} Z`;
}

function Ring({ slices, cx, cy, r0, r1, total, hover, setHover }: {
  slices: Slice[]; cx: number; cy: number; r0: number; r1: number; total: number;
  hover: string | null; setHover: (k: string | null) => void;
}) {
  const starts = slices.reduce<number[]>((acc, s, i) => [...acc, acc[i] + (s.v / total) * Math.PI * 2], [0]);
  return (
    <>
      {slices.map((s, i) => {
        const a0 = starts[i], a1 = starts[i + 1];
        if (a1 - a0 < 0.002) return null;
        return (
          <path key={s.key} d={arc(cx, cy, r0, r1, a0, a1)} fill={s.color} stroke="var(--oasis-panel)" strokeWidth={1}
            opacity={hover && hover !== s.key ? 0.45 : 1} className="transition-opacity"
            onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
            <title>{`${s.label}: ${s.v.toFixed(1)}%`}</title>
          </path>
        );
      })}
    </>
  );
}

/** lighter / darker shade of a hex colour for sub-sector slices */
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

export default function PortfolioPies({ positions }: { positions: Position[] }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  const sectors = useMemo(() => {
    const rows = sectorExposure(positions);
    const sum = rows.reduce((a, r) => a + r.total, 0) || 1;
    return rows.map((r, i) => ({
      key: r.sector, label: r.sector, v: (r.total / sum) * 100, color: SECTOR_COLORS[i % SECTOR_COLORS.length],
      subs: Object.entries(r.subs).sort((a, b) => b[1] - a[1]).map(([s, v]) => ({ label: s, v: (v / sum) * 100 })),
    }));
  }, [positions]);
  const subSlices = useMemo<Slice[]>(() => sectors.flatMap((s) => s.subs.map((x, j) => ({
    key: `${s.key}/${x.label}`, label: `${s.label} › ${x.label}`, v: x.v,
    color: shade(s.color, s.subs.length > 1 ? 0.45 - (0.75 * j) / (s.subs.length - 1) : 0.2),
  }))), [sectors]);
  const holdings = useMemo<Slice[]>(() => {
    const sum = positions.reduce((a, p) => a + p.weight, 0) || 1;
    return positions.map((p, i) => ({ key: p.asset.ticker, label: p.asset.ticker, v: (p.weight / sum) * 100, color: SEG_COLORS[i % SEG_COLORS.length] }));
  }, [positions]);

  const S = open ? 300 : 190, c = S / 2;
  const hovered = hover ? [...sectors, ...subSlices, ...holdings].find((x) => x.key === hover) : null;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] p-3 font-mono lg:grid-cols-[auto_auto_minmax(0,1fr)]">
      {/* SECTORS — click to open the sub-sector ring */}
      <div className="flex flex-col items-center gap-2">
        <span className="self-start text-[10px] font-semibold tracking-[0.14em] text-zinc-300">SECTORS <span className="text-zinc-600">· CLICK = SUB-SECTORS</span></span>
        <button type="button" onClick={() => setOpen((o) => !o)} title={open ? "Hide sub-sectors" : "Show sub-sectors"} className="relative cursor-pointer transition-[width,height] duration-300" style={{ width: S, height: S }}>
          <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
            <Ring slices={sectors} cx={c} cy={c} r0={c * 0.42} r1={open ? c * 0.7 : c * 0.98} total={100} hover={hover} setHover={setHover} />
            {open && <Ring slices={subSlices} cx={c} cy={c} r0={c * 0.72} r1={c * 0.98} total={100} hover={hover} setHover={setHover} />}
          </svg>
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="max-w-[90px] truncate text-[10px] text-zinc-400">{hovered && !holdings.includes(hovered as Slice) ? hovered.label.split(" › ").pop() : `${sectors.length} SECTORS`}</span>
            <span className="text-[15px] font-bold text-zinc-100">{hovered && !holdings.includes(hovered as Slice) ? `${hovered.v.toFixed(1)}%` : "100%"}</span>
          </span>
        </button>
      </div>

      {/* HOLDINGS */}
      <div className="flex flex-col items-center gap-2">
        <span className="self-start text-[10px] font-semibold tracking-[0.14em] text-zinc-300">HOLDINGS</span>
        <div className="relative" style={{ width: 190, height: 190 }}>
          <svg width={190} height={190} viewBox="0 0 190 190">
            <Ring slices={holdings} cx={95} cy={95} r0={40} r1={93} total={100} hover={hover} setHover={setHover} />
          </svg>
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] text-zinc-400">{hovered && holdings.includes(hovered as Slice) ? hovered.label : `${holdings.length} POS.`}</span>
            <span className="text-[15px] font-bold text-zinc-100">{hovered && holdings.includes(hovered as Slice) ? `${hovered.v.toFixed(1)}%` : "100%"}</span>
          </span>
        </div>
      </div>

      {/* sector table */}
      <div className="flex min-w-0 flex-col">
        <div className="grid grid-cols-[12px_minmax(0,1fr)_64px] gap-2 border-b border-white/[0.06] pb-1.5 text-[9.5px] tracking-[0.14em] text-zinc-500">
          <span /><span>SECTOR</span><span className="text-right">% PORTF.</span>
        </div>
        <div className="flex max-h-[300px] flex-col overflow-y-auto">
          {sectors.map((s) => (
            <div key={s.key} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} className={`border-b border-white/[0.03] py-1 ${hover === s.key ? "bg-white/[0.03]" : ""}`}>
              <div className="grid grid-cols-[12px_minmax(0,1fr)_64px] items-center gap-2 text-[12px]">
                <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />
                <span className="truncate text-zinc-200">{s.label}</span>
                <span className="text-right font-semibold tabular-nums text-zinc-100">{s.v.toFixed(1)}%</span>
              </div>
              {open && s.subs.length > 1 && s.subs.slice(0, 4).map((x) => (
                <div key={x.label} className="grid grid-cols-[12px_minmax(0,1fr)_64px] gap-2 pl-3 text-[10.5px] text-zinc-500">
                  <span /><span className="truncate">› {x.label}</span><span className="text-right tabular-nums">{x.v.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
