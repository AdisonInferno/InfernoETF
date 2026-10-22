"use client";

/* Portfolio composition at a glance:
   · SECTORS donut — click it to open the "pizza": it grows and an outer ring shows the
     sub-sectors inside every sector (all sectors stay visible, each slice split into its parts)
   · HOLDINGS donut — the positions by weight (same colours as everywhere else)
   · table on the right: % of the portfolio per sector (+ its biggest sub-sectors when open). */

import { useMemo, useState } from "react";
import { sectorExposure, type Position } from "@/lib/portfolio";
import { SUB_PARENT } from "@/lib/fund-profiles";
import { buildFund } from "@/components/deep-view/buildFund";
import { SegRail } from "@/components/InfernoChart";
import { useHoldingReturns, type RetPeriod } from "@/components/deep-view/useHoldingReturns";
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

const PERIODS: RetPeriod[] = ["1D", "1W", "1M", "3M", "YTD", "1Y"];
const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`;
const pp = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)} pp`;

/** one row of a drivers / draggers list: label · value · bar */
function Bar({ label, sub, v, max, fmt }: { label: string; sub?: string; v: number; max: number; fmt: (v: number) => string }) {
  const up = v >= 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_64px_70px] items-center gap-2 py-[3px] text-[11.5px]">
      <span className="flex min-w-0 items-baseline gap-1.5"><span className="truncate font-bold text-zinc-100">{label}</span>{sub && <span className="flex-none text-[9.5px] text-zinc-500">{sub}</span>}</span>
      <span className="h-[5px] bg-white/[0.04]"><span className={`block h-full ${up ? "bg-emerald-400/70" : "bg-rose-400/70"}`} style={{ width: `${Math.min(100, (Math.abs(v) / (max || 1)) * 100)}%` }} /></span>
      <span className={`text-right font-semibold tabular-nums ${up ? "text-emerald-400" : "text-rose-400"}`}>{fmt(v)}</span>
    </div>
  );
}

function UpDown({ title, hint, rows, fmt, loading }: { title: string; hint: string; rows: { k: string; label: string; sub?: string; v: number }[]; fmt: (v: number) => string; loading: boolean }) {
  const up = rows.filter((r) => r.v > 0).sort((a, b) => b.v - a.v).slice(0, 5);
  const down = rows.filter((r) => r.v < 0).sort((a, b) => a.v - b.v).slice(0, 5);
  const max = Math.max(0, ...rows.map((r) => Math.abs(r.v)));
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[10px] font-semibold tracking-[0.14em] text-zinc-300" title={hint}>{title}</span>
      <span className="text-[9.5px] tracking-[0.12em] text-emerald-400/80">▲ DRIVERS</span>
      {loading ? <div className="h-16 animate-pulse rounded-sm bg-white/[0.03]" /> : up.length ? up.map((r) => <Bar key={r.k} {...r} max={max} fmt={fmt} />) : <span className="text-[10.5px] text-zinc-600">none in this window</span>}
      <span className="mt-1 text-[9.5px] tracking-[0.12em] text-rose-400/80">▼ DRAGGERS</span>
      {loading ? <div className="h-16 animate-pulse rounded-sm bg-white/[0.03]" /> : down.length ? down.map((r) => <Bar key={r.k} {...r} max={max} fmt={fmt} />) : <span className="text-[10.5px] text-zinc-600">none in this window</span>}
    </div>
  );
}

export default function PortfolioPies({ positions, symOf = {} }: { positions: Position[]; /** our ticker → Yahoo symbol (BDX.PL → BDX.WA) */ symOf?: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [period, setPeriod] = useState<RetPeriod>("1D");

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

  /* look-through: every company in the portfolio with its portfolio weight and its sector */
  const parts = useMemo(() => {
    const out: { sym: string; w: number; sector: string }[] = [];
    for (const { asset: a, weight } of positions) {
      const f = a.kind === "etf" ? buildFund(a.ticker) : null;
      if (f && f.holdings.length) {
        const tot = f.holdings.reduce((t, h) => t + h.w, 0) || 1;
        for (const h of f.holdings) {
          const sub = f.holdingMeta[h.tic]?.sector ?? "Other";
          out.push({ sym: h.tic === "GOOG" ? "GOOGL" : h.tic, w: (weight * h.w) / tot, sector: SUB_PARENT[sub] ?? sub });
        }
      } else out.push({ sym: symOf[a.ticker] ?? a.ticker, w: weight, sector: a.sector === "Consumer" ? "Consumer Disc." : a.sector || "Other" });
    }
    return out;
  }, [positions, symOf]);
  const posSyms = useMemo(() => positions.map((p) => symOf[p.asset.ticker] ?? p.asset.ticker), [positions, symOf]);
  const syms = useMemo(() => [...new Set([...posSyms, ...parts.map((x) => x.sym)])], [posSyms, parts]);
  const { ret, state } = useHoldingReturns(syms, period);
  const loading = state === "loading";

  /* PnL attribution: contribution of each position = weight × return (percentage points of the portfolio) */
  const attrib = useMemo(() => positions.map((p, i) => {
    const r = ret[posSyms[i].toUpperCase()];
    return r == null ? null : { k: p.asset.ticker, label: p.asset.ticker, sub: pct(r), v: (p.weight / 100) * r };
  }).filter((x): x is NonNullable<typeof x> => !!x), [positions, posSyms, ret]);
  /* sector change: each sector's own return = Σ(weight × return) / Σ weight of its companies */
  const secChg = useMemo(() => {
    const m = new Map<string, { wr: number; w: number }>();
    for (const x of parts) {
      const r = ret[x.sym.toUpperCase()];
      if (r == null) continue;
      const c = m.get(x.sector) ?? { wr: 0, w: 0 };
      c.wr += x.w * r; c.w += x.w;
      m.set(x.sector, c);
    }
    return [...m].filter(([, c]) => c.w > 0).map(([s, c]) => ({ k: s, label: s, sub: `${(sectors.find((x) => x.key === s)?.v ?? 0).toFixed(1)}% of pf`, v: c.wr / c.w }));
  }, [parts, ret, sectors]);

  const S = open ? 260 : 170, c = S / 2;
  const hovered = hover ? [...sectors, ...subSlices, ...holdings].find((x) => x.key === hover) : null;
  const hovSector = hovered && !holdings.includes(hovered as Slice);
  const hovStock = hovered && holdings.includes(hovered as Slice);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] p-3 font-mono xl:grid-cols-[auto_auto_auto_minmax(0,1fr)_minmax(0,1fr)]">
      {/* SECTORS — click to open the sub-sector ring */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="self-start text-[9.5px] tracking-[0.12em] text-zinc-600">CLICK = SUB-SECTORS</span>
        <button type="button" onClick={() => setOpen((o) => !o)} title={open ? "Hide sub-sectors" : "Show sub-sectors"} className="relative cursor-pointer transition-[width,height] duration-300" style={{ width: S, height: S }}>
          <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
            <Ring slices={sectors} cx={c} cy={c} r0={c * 0.46} r1={open ? c * 0.7 : c * 0.98} total={100} hover={hover} setHover={setHover} />
            {open && <Ring slices={subSlices} cx={c} cy={c} r0={c * 0.72} r1={c * 0.98} total={100} hover={hover} setHover={setHover} />}
          </svg>
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {hovSector ? (<>
              <span className="max-w-[80px] truncate text-[10px] text-zinc-400">{hovered!.label.split(" › ").pop()}</span>
              <span className="text-[15px] font-bold text-zinc-100">{hovered!.v.toFixed(1)}%</span>
            </>) : <span className="text-[11px] font-bold tracking-[0.16em] text-zinc-200">SECTORS</span>}
          </span>
        </button>
      </div>

      {/* STOCKS (what you hold) */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="self-start text-[9.5px] tracking-[0.12em] text-zinc-600">&nbsp;</span>
        <div className="relative" style={{ width: 170, height: 170 }}>
          <svg width={170} height={170} viewBox="0 0 170 170">
            <Ring slices={holdings} cx={85} cy={85} r0={39} r1={83} total={100} hover={hover} setHover={setHover} />
          </svg>
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {hovStock ? (<>
              <span className="text-[10px] text-zinc-400">{hovered!.label}</span>
              <span className="text-[15px] font-bold text-zinc-100">{hovered!.v.toFixed(1)}%</span>
            </>) : <span className="text-[11px] font-bold tracking-[0.16em] text-zinc-200">STOCKS</span>}
          </span>
        </div>
      </div>

      {/* sector table — compact: % right next to the name */}
      <div className="flex w-[210px] min-w-0 flex-col">
        <div className="grid grid-cols-[10px_minmax(0,1fr)_48px] gap-2 border-b border-white/[0.06] pb-1 text-[9px] tracking-[0.14em] text-zinc-500">
          <span /><span>SECTOR</span><span className="text-right">% PF</span>
        </div>
        <div className="flex max-h-[260px] flex-col overflow-y-auto">
          {sectors.map((s) => (
            <div key={s.key} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} className={`border-b border-white/[0.03] py-[3px] ${hover === s.key ? "bg-white/[0.03]" : ""}`}>
              <div className="grid grid-cols-[10px_minmax(0,1fr)_48px] items-center gap-2 text-[11.5px]">
                <span className="h-2 w-2 rounded-xs" style={{ background: s.color }} />
                <span className="truncate text-zinc-200">{s.label}</span>
                <span className="text-right font-semibold tabular-nums text-zinc-100">{s.v.toFixed(1)}%</span>
              </div>
              {open && s.subs.length > 1 && s.subs.slice(0, 4).map((x) => (
                <div key={x.label} className="grid grid-cols-[10px_minmax(0,1fr)_48px] gap-2 pl-2 text-[10px] text-zinc-500">
                  <span /><span className="truncate">› {x.label}</span><span className="text-right tabular-nums">{x.v.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* PnL attribution (positions) */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex justify-end"><SegRail items={PERIODS} value={period} onChange={setPeriod} width={PERIODS.length * 40} /></div>
        <UpDown title={`PNL ATTRIBUTION · ${period}`} hint="Contribution of each position to the portfolio = weight × its return (percentage points)" rows={attrib} fmt={pp} loading={loading} />
      </div>
      {/* sector change: how each sector itself moved */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="h-[26px]" />
        <UpDown title={`SECTOR CHANGE · ${period}`} hint="Each sector's own return: every company in it weighted by how much of the sector it is (look-through of your ETFs)" rows={secChg} fmt={pct} loading={loading} />
      </div>
    </div>
  );
}
