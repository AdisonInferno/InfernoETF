"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FundData } from "./types";
import { hash01, seeded } from "./utils";

/* ─────────────────────────────────────────────────────────────
   Holdings Explorer  (COMPOSITION MAP tab)
     1. Concentration / skew alerts
     2. Relative-performance chart  (ETF benchmark always on)
        + dynamic legend of plotted tickers · CLEAR ALL
     3. Toolbar: search · sector filter · export CSV
     4. Master table — first column toggles a stock's line
   All series are deterministic placeholder data.
   ───────────────────────────────────────────────────────────── */

const MAX_LINES = 6;
/** Series colours handed out in order to newly plotted tickers. */
const PALETTE = ["#34d399", "#60a5fa", "#a78bfa", "#fbbf24", "#fb7185", "#22d3ee"];
const ETF_KEY = "__ETF__";
const WEEKS = 52;
/** Last data point: Fri 2 Oct 2026 (fixed so server and client render identically). */
const END_UTC = Date.UTC(2026, 9, 2);
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const signed = (v: number, d = 2) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d) + "%";
const capF = (v: number) => (v <= 0 ? "—" : v >= 1000 ? "$" + (v / 1000).toFixed(2) + "T" : "$" + v.toFixed(0) + "B");

type SortKey = "rank" | "tic" | "name" | "sub" | "w" | "cap" | "r1y";
const HEAD: [string, SortKey, "left" | "right"][] = [
  ["TICKER", "tic", "left"], ["COMPANY NAME", "name", "left"], ["SECTOR", "sub", "left"],
  ["WEIGHT", "w", "left"], ["MARKET CAP", "cap", "right"], ["1Y RETURN", "r1y", "right"],
];
const GRID = "grid grid-cols-[40px_72px_minmax(0,2fr)_minmax(0,1.2fr)_minmax(150px,1.2fr)_92px_96px] items-center gap-3 px-4";

const LEVEL_STYLE = {
  CRITICAL: { box: "border-[#ff6a00] bg-[#ff6a00]/[0.06]", icon: "text-[#ff6a00]", text: "text-[#ffb27a]", label: "text-[#ff8a3d]" },
  ELEVATED: { box: "border-amber-500/70 bg-amber-500/[0.05]", icon: "text-amber-400", text: "text-amber-200/80", label: "text-amber-400" },
  LOW: { box: "border-emerald-400/50 bg-emerald-400/[0.05]", icon: "text-emerald-400", text: "text-emerald-200/80", label: "text-emerald-400" },
} as const;

/* ── Mock series ───────────────────────────────────────────── */

interface Row { rank: number; tic: string; name: string; w: number; sub: string; cap: number; r1y: number }

/** Random walk that ends exactly at `target` %, sharing a market factor. */
function path(target: number, seed: string, market: number[], beta: number, idioVol: number): number[] {
  const rnd = seeded(Math.floor(hash01(seed) * 1e9));
  const walk = [0];
  for (let i = 1; i <= WEEKS; i++) walk.push(walk[i - 1] + (rnd() - 0.5) * (rnd() < 0.06 ? 3.2 : 1));
  const mix = walk.map((v, i) => beta * market[i] + idioVol * v);
  const end = mix[WEEKS];
  return mix.map((v, i) => { const f = i / WEEKS; return +(target * f + (v - f * end)).toFixed(2); });
}

function weekLabel(i: number) {
  const d = new Date(END_UTC - (WEEKS - i) * 7 * 864e5);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")} '${String(d.getUTCFullYear()).slice(2)}`;
}

function buildModel(fund: FundData) {
  const etfR = fund.perf["1Y"], vol = fund.volMul;
  const all: Row[] = fund.holdings.map((h, i) => {
    const m = fund.holdingMeta[h.tic] ?? { sector: "Other", capB: 0 };
    const r1y = +Math.max(-85, etfR + (hash01(h.tic + "1y") - 0.45) * 70 * vol).toFixed(2);
    return { rank: i + 1, tic: h.tic, name: h.name, w: h.w, sub: m.sector, cap: m.capB, r1y };
  });

  const rnd = seeded(Math.floor(hash01(fund.tic + "mkt") * 1e9));
  const market = [0];
  for (let i = 1; i <= WEEKS; i++) market.push(market[i - 1] + (rnd() - 0.5) * 2.6 * vol);

  const series: Record<string, number[]> = { [ETF_KEY]: path(etfR, fund.tic, market, 1, 0.35 * vol) };
  all.forEach((h) => {
    series[h.tic] = path(h.r1y, h.tic, market, 0.7 + hash01(h.tic + "beta") * 0.8, (1.2 + hash01(h.tic + "iv") * 1.6) * vol);
  });
  const points = Array.from({ length: WEEKS + 1 }, (_, i) => {
    const p: Record<string, number | string> = { t: weekLabel(i) };
    for (const k in series) p[k] = series[k][i];
    return p;
  });
  return { all, points, etfR };
}

/* ── Tooltip ───────────────────────────────────────────────── */

interface TipEntry { dataKey?: unknown; value?: unknown; color?: string }

function ChartTip({ active, label, payload, etfTic }: { active?: boolean; label?: unknown; payload?: readonly TipEntry[]; etfTic: string }) {
  if (!active || !payload?.length) return null;
  const rows = [...payload].sort((a, b) => Number(b.value) - Number(a.value));
  return (
    <div className="min-w-[180px] rounded-lg border border-white/[0.08] bg-[#030303]/95 px-3 py-2.5 font-mono text-[11px] tabular-nums">
      <div className="mb-1.5 text-[9.5px] tracking-[0.14em] text-zinc-500">{String(label)}</div>
      {rows.map((p) => {
        const key = String(p.dataKey), v = Number(p.value), isEtf = key === ETF_KEY;
        return (
          <div key={key} className="flex items-center justify-between gap-4 py-[1px]">
            <span className={`flex items-center gap-2 ${isEtf ? "font-bold text-white" : "text-zinc-300"}`}>
              <span className="h-[3px] w-3 rounded-full" style={{ background: p.color }} />
              {isEtf ? etfTic : key}
            </span>
            <span className={v >= 0 ? "text-emerald-400" : "text-red-400"}>{signed(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Component ─────────────────────────────────────────────── */

export default function HoldingsExplorer({ fund }: { fund: FundData }) {
  const { all, points, etfR } = useMemo(() => buildModel(fund), [fund]);

  // Plotted tickers → colour. Default: two largest holdings.
  const [plotted, setPlotted] = useState<Map<string, string>>(() => new Map(all.slice(0, 2).map((h, i) => [h.tic, PALETTE[i]])));
  const [hover, setHover] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [dir, setDir] = useState<1 | -1>(1);

  const toggle = (tic: string) => {
    const next = new Map(plotted);
    if (next.has(tic)) { next.delete(tic); setLimitHit(false); }
    else if (next.size >= MAX_LINES) { setLimitHit(true); return; }
    else {
      const used = new Set(next.values());
      next.set(tic, PALETTE.find((c) => !used.has(c)) ?? PALETTE[0]);
    }
    setPlotted(next);
  };
  const clearAll = () => { setPlotted(new Map()); setLimitHit(false); setHover(null); };

  /* Alerts */
  const top5 = all.slice(0, 5).reduce((a, x) => a + x.w, 0);
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
  const ls = LEVEL_STYLE[level];

  /* Table */
  const subs = useMemo(() => Array.from(new Set(all.map((x) => x.sub))), [all]);
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return all
      .filter((x) => (filter === "ALL" || x.sub === filter) && (!qq || x.tic.toLowerCase().includes(qq) || x.name.toLowerCase().includes(qq)))
      .sort((a, b) => { const va = a[sortKey], vb = b[sortKey]; return (typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * dir; });
  }, [all, q, filter, sortKey, dir]);
  const maxW = all[0]?.w ?? 1;
  const sortBy = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setDir(k === "w" || k === "cap" || k === "r1y" ? -1 : 1); }
  };
  const exportCsv = () => {
    const csv = "rank,ticker,company,sector,weight_pct,market_cap_usd_b,return_1y_pct\n" +
      rows.map((x) => [x.rank, x.tic, `"${x.name}"`, x.sub, x.w, x.cap, x.r1y].join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${fund.tic}_holdings.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  };

  const shown = all.filter((h) => plotted.has(h.tic));
  const dim = (k: string) => hover !== null && hover !== k;

  return (
    <section className="flex flex-none flex-col gap-3 font-mono tabular-nums">
      {/* 1 ── Alerts */}
      <div className={`flex items-center gap-3 border px-3.5 py-2.5 ${ls.box}`}>
        <span className={`flex-none text-[15px] ${ls.icon}`}>{level === "LOW" ? "✓" : "⚠"}</span>
        <span className={`text-pretty text-xs leading-[1.45] ${ls.text}`}>
          <span className={`font-bold tracking-[0.08em] ${ls.label}`}>{level} CONCENTRATION:</span> The Top 5 holdings account for <span className="font-bold text-white">{top5.toFixed(1)}%</span> of this portfolio. {levelText}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => <span key={c} className="flex h-6 items-center gap-1.5 whitespace-nowrap border border-amber-500/60 bg-amber-500/[0.07] px-2.5 text-[10.5px] font-bold tracking-[0.08em] text-amber-500">⚠ {c}</span>)}
      </div>

      {/* 2 ── Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-2">
        <label className="flex h-8 min-w-[220px] flex-[0_1_360px] items-center gap-2 rounded-xl border border-white/[0.05] bg-[#0a0a0c] px-2.5 focus-within:border-zinc-700">
          <span className="text-[11px] font-bold text-zinc-500">Q</span>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${all.length} holdings...`} className="min-w-0 flex-1 border-0 bg-transparent font-mono text-[11.5px] text-neutral-200 outline-none" />
        </label>
        <div className="flex items-center gap-2">
          <label className="relative flex h-8 items-center whitespace-nowrap rounded-xl border border-white/[0.05] bg-[#0a0a0c] pl-2.5 pr-7 text-[10.5px] font-bold tracking-[0.08em] text-zinc-300 hover:border-zinc-700">
            <span>[ FILTER: {filter === "ALL" ? "ALL SECTORS" : filter.toUpperCase()} ]</span>
            <span className="absolute right-2.5 text-zinc-500">▾</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
              <option value="ALL">ALL SECTORS</option>
              {subs.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <button type="button" onClick={exportCsv} className="flex h-8 items-center whitespace-nowrap border border-emerald-400 px-3 text-[10.5px] font-bold tracking-[0.1em] text-emerald-400 hover:bg-emerald-400 hover:text-black">[ ↓ EXPORT .CSV ]</button>
        </div>
      </div>

      {/* 3 ── Master table (scrolls; keeps the chart in view) */}
      <div className="overflow-x-auto rounded-2xl border border-white/[0.05] bg-[#0a0a0c]">
        <div className="max-h-[min(400px,40vh)] min-w-[860px] overflow-y-auto overscroll-contain [scrollbar-color:#27272a_transparent] [scrollbar-width:thin]">
          <div className={`sticky top-0 z-[2] h-9 border-b border-white/[0.06] bg-[#0a0a0c] text-[9.5px] font-bold tracking-[0.14em] text-zinc-500 ${GRID}`}>
            <span className="text-center" title="Plot on chart">◫</span>
            {HEAD.map(([l, k, al]) => (
              <button key={k} type="button" onClick={() => sortBy(k)} className={`whitespace-nowrap hover:text-white ${al === "right" ? "text-right" : "text-left"} ${sortKey === k ? "text-emerald-400" : ""}`}>
                {l}{sortKey === k ? (dir > 0 ? " ▲" : " ▼") : ""}
              </button>
            ))}
          </div>

          {rows.map((r) => {
            const c = plotted.get(r.tic), on = c !== undefined;
            const full = !on && plotted.size >= MAX_LINES;
            return (
              <div
                key={r.tic}
                role="checkbox"
                aria-checked={on}
                aria-disabled={full}
                aria-label={`${on ? "Hide" : "Plot"} ${r.tic} on chart`}
                tabIndex={0}
                onClick={() => toggle(r.tic)}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(r.tic); } }}
                onMouseEnter={() => on && setHover(r.tic)}
                onMouseLeave={() => setHover(null)}
                className={`h-[34px] cursor-pointer border-b border-white/[0.04] text-[11.5px] transition-colors last:border-b-0 hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none ${on ? "bg-white/[0.015]" : ""} ${GRID}`}
                style={on ? { boxShadow: `inset 2px 0 0 ${c}` } : undefined}
              >
                <span className="flex justify-center">
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors ${full ? "opacity-30" : ""}`}
                    style={{ borderColor: on ? c : "#3f3f46", background: on ? c : "transparent" }}
                  >
                    {on && (
                      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
                        <path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="#030303" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                </span>
                <span className="font-bold" style={{ color: on ? c : "#ffffff" }}>{r.tic}</span>
                <span className="truncate font-display text-xs text-zinc-300">{r.name}</span>
                <span className="truncate text-[10.5px] tracking-[0.04em] text-zinc-400">{r.sub}</span>
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="w-[46px] flex-none text-right font-semibold text-neutral-100">{r.w.toFixed(2)}%</span>
                  <span className="h-[3px] flex-1 bg-white/[0.06]">
                    <span className="block h-full" style={{ width: ((r.w / maxW) * 100).toFixed(1) + "%", background: on ? c : "#52525b" }} />
                  </span>
                </span>
                <span className="text-right text-zinc-300">{capF(r.cap)}</span>
                <span className={`text-right font-semibold ${r.r1y >= 0 ? "text-emerald-400" : "text-red-400"}`}>{signed(r.r1y)}</span>
              </div>
            );
          })}
          {rows.length === 0 && <div className="p-8 text-center text-[11px] tracking-[0.14em] text-zinc-600">NO MATCHING HOLDINGS</div>}
        </div>
      </div>
      <div className="flex justify-between gap-3 text-[9.5px] tracking-[0.1em] text-zinc-600">
        <span>{rows.length} / {all.length} ROWS · Σ WEIGHT {rows.reduce((a, x) => a + x.w, 0).toFixed(2)}% · 1Y RETURNS = PLACEHOLDER DATA</span>
        <span>SOURCE: ISSUER FILING · 2026-09-25</span>
      </div>
      {/* 4 ── Chart (bottom) */}
      <div className="mt-3 rounded-2xl border border-white/[0.05] bg-[#0a0a0c] px-2 pb-3 pt-3.5 sm:px-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-2">
          <span className="font-display text-xs font-bold tracking-[0.18em] text-neutral-300">RELATIVE PERFORMANCE · 1Y</span>
          <span className="text-[10px] tracking-[0.08em] text-zinc-500">NORMALISED TO 0% · TICK A HOLDING ABOVE TO PLOT IT</span>
        </div>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <filter id="etfGlow" x="-5%" y="-30%" width="110%" height="160%">
                  <feGaussianBlur stdDeviation="2.4" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="t"
                ticks={[5, 18, 31, 44].map((i) => points[i].t as string)}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#52525b", fontSize: 9.5, fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}
                tickFormatter={(v: string) => v.slice(0, 3) + " '" + v.slice(-2)}
                dy={6}
              />
              <YAxis
                orientation="right"
                width={52}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#52525b", fontSize: 9.5, fontFamily: "var(--font-mono)" }}
                tickFormatter={(v: number) => (v > 0 ? "+" : "") + v.toFixed(0) + "%"}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.14)" strokeDasharray="3 4" />
              <Tooltip
                cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }}
                content={(p) => <ChartTip active={p.active} label={p.label} payload={p.payload as readonly TipEntry[]} etfTic={fund.tic} />}
              />
              {shown.map((h) => (
                <Line
                  key={h.tic}
                  dataKey={h.tic}
                  type="monotone"
                  stroke={plotted.get(h.tic)}
                  strokeWidth={hover === h.tic ? 2.4 : 1.6}
                  strokeOpacity={dim(h.tic) ? 0.18 : 0.95}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                  animationDuration={450}
                />
              ))}
              <Line
                dataKey={ETF_KEY}
                type="monotone"
                stroke="#f4f4f5"
                strokeWidth={3}
                strokeOpacity={hover ? 0.5 : 1}
                filter="url(#etfGlow)"
                dot={false}
                activeDot={{ r: 4, fill: "#ffffff", strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Dynamic legend */}
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/[0.05] px-2 pt-3 text-[10.5px]">
          <span className="flex h-6 items-center gap-1.5 rounded-md bg-white/[0.06] px-2 font-bold text-white">
            <span className="h-[3px] w-3.5 rounded-full bg-zinc-100" />{fund.tic}
            <span className={etfR >= 0 ? "text-emerald-400" : "text-red-400"}>{signed(etfR, 1)}</span>
          </span>
          {shown.map((h) => (
            <button
              key={h.tic}
              type="button"
              onClick={() => toggle(h.tic)}
              onMouseEnter={() => setHover(h.tic)}
              onMouseLeave={() => setHover(null)}
              title={`Remove ${h.tic}`}
              className="group flex h-6 items-center gap-1.5 rounded-md border border-white/[0.06] px-2 text-zinc-200 hover:border-white/20"
            >
              <span className="h-0.5 w-3.5 rounded-full" style={{ background: plotted.get(h.tic) }} />
              {h.tic}
              <span className={h.r1y >= 0 ? "text-emerald-400" : "text-red-400"}>{signed(h.r1y, 1)}</span>
              <span className="text-zinc-600 group-hover:text-zinc-200">×</span>
            </button>
          ))}
          <span className="ml-auto flex items-center gap-3">
            <span className={`text-[10px] tracking-[0.1em] ${limitHit ? "text-amber-400" : "text-zinc-600"}`}>
              {limitHit ? `MAX ${MAX_LINES} LINES · REMOVE ONE FIRST` : `${shown.length}/${MAX_LINES} PLOTTED`}
            </span>
            {shown.length > 0 && (
              <button type="button" onClick={clearAll} className="rounded-md px-2 py-1 text-[10px] font-bold tracking-[0.1em] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-100">
                CLEAR ALL
              </button>
            )}
          </span>
        </div>
      </div>

    </section>
  );
}
