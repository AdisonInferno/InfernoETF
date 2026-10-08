"use client";

import { useMemo, useRef, useState } from "react";
import type { FundData, FundStats, Tf } from "./types";
import { BRUSH_PRESET, TF, makeSeries } from "./mockData";
import { rangeDate, sg, usd } from "./utils";

/* ─────────────────────────────────────────────────────────────
   Chart Overview
   ┌ timeframe selector ───────────────────── price · Δ% (tf) ┐
   │ line chart                                               │
   │ mini-map / brush                                         │
   └──────────────────────────────────────────────────────────┘
   [ Fund Profile ] [ Income & Tracking ] [ Risk ] [ Quant ]
   ───────────────────────────────────────────────────────────── */

const CHART_TFS = ["1W", "2W", "1M", "3M", "YTD", "1Y", "3Y"] as const satisfies readonly Tf[];
type ChartTf = (typeof CHART_TFS)[number];

const GAIN = "#34D399", LOSS = "#F87171";
const SURFACE = "rounded-2xl border border-white/[0.05] bg-[#0a0a0c]";
const axisY = (p: number, lo: number, hi: number) => 30 + (1 - (p - lo) / (hi - lo || 1)) * 360;
const pct2 = (v: number) => v.toFixed(2) + "%";
/** 450.2 → "$450.2B", 0.84 → "$840M" */
const aumFmt = (b: number) => (b >= 1 ? "$" + b.toFixed(1) + "B" : "$" + Math.round(b * 1000) + "M");
/** 0.0945 → "0.0945%", 0.03 → "0.03%" */
const terFmt = (v: number) => v.toFixed(Math.abs(v * 100 - Math.round(v * 100)) > 1e-6 ? 4 : 2) + "%";

/* ── Metrics grid ─────────────────────────────────────────── */

type Tone = "up" | "down" | "flat";
interface Metric { label: string; value: string; tone?: Tone; hint?: string }
interface MetricGroup { title: string; items: [Metric, Metric] }

const TONE: Record<Tone, string> = { up: "text-emerald-400", down: "text-red-400", flat: "text-neutral-100" };
const toneOf = (v: number): Tone => (v > 0 ? "up" : v < 0 ? "down" : "flat");

function metricGroups(s: FundStats): MetricGroup[] {
  return [
    {
      title: "FUND PROFILE",
      items: [
        { label: "AUM", value: aumFmt(s.aumB) },
        { label: "TER", value: terFmt(s.ter), hint: "Expense ratio" },
      ],
    },
    {
      title: "INCOME & TRACKING",
      items: [
        { label: "DIV YIELD", value: pct2(s.divYield) },
        { label: "NAV / PREM", value: sg(s.navPrem), tone: toneOf(s.navPrem) },
      ],
    },
    {
      title: "RISK PROFILE",
      items: [
        { label: "BETA", value: s.beta.toFixed(2), hint: "vs S&P 500" },
        { label: "30D VOL", value: s.vol30d.toFixed(1) + "%", hint: "Annualised" },
      ],
    },
    {
      title: "QUANT METRICS",
      items: [
        { label: "SHARPE", value: s.sharpe.toFixed(2) },
        { label: "MAX DD", value: s.maxDD.toFixed(1) + "%", tone: "down" },
      ],
    },
  ];
}

function MetricsGrid({ stats }: { stats: FundStats }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metricGroups(stats).map((g) => (
        <section key={g.title} className={`${SURFACE} flex min-w-0 flex-col px-5 pb-4 pt-3.5`}>
          <h3 className="m-0 font-mono text-[9.5px] font-bold tracking-[0.2em] text-zinc-500">{g.title}</h3>
          <div className="mt-3 grid grid-cols-2 divide-x divide-white/[0.05]">
            {g.items.map((m, k) => (
              <div key={m.label} className={`flex min-w-0 flex-col gap-1.5 ${k === 0 ? "pr-4" : "pl-4"}`} title={m.hint}>
                <span className="whitespace-nowrap font-mono text-[10px] font-semibold tracking-[0.12em] text-zinc-500">{m.label}</span>
                <span className={`whitespace-nowrap font-mono text-[20px] font-semibold leading-none tabular-nums tracking-[-0.01em] ${TONE[m.tone ?? "flat"]}`}>
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── Chart ─────────────────────────────────────────────────── */

export default function PriceChart({ fund }: { fund: FundData }) {
  const [tf, setTf] = useState<ChartTf>("YTD");
  const [custom, setCustom] = useState<[number, number] | null>(null);
  const [hov, setHov] = useState<number | null>(null);
  const miniRef = useRef<HTMLDivElement>(null);

  const p5 = useMemo(() => makeSeries("5Y", fund.price, fund.perf["5Y"], fund.tic, fund.volMul), [fund]);
  const tfSeries = useMemo(() => makeSeries(tf, fund.price, fund.perf[tf], fund.tic, fund.volMul), [tf, fund]);
  const N5 = p5.length;
  const br = custom ?? BRUSH_PRESET[tf];

  const i0 = Math.round(br[0] * (N5 - 1));
  const i1 = Math.max(i0 + 1, Math.round(br[1] * (N5 - 1)));
  const pts = custom ? p5.slice(i0, i1 + 1) : tfSeries;
  const n = pts.length, lo = Math.min(...pts), hi = Math.max(...pts);
  /** % change over the active window — follows the selector on the left (or the brushed range). */
  const chg = custom ? (pts[n - 1] / pts[0] - 1) * 100 : fund.perf[tf];
  const col = chg >= 0 ? GAIN : LOSS;
  const label = custom ? "RANGE" : tf;

  const line = "M" + pts.map((p, i) => `${((i / (n - 1)) * 1000).toFixed(1)},${axisY(p, lo, hi).toFixed(1)}`).join(" L");
  const at = (i: number) => ({ x: ((i / (n - 1)) * 100).toFixed(2) + "%", y: (axisY(pts[i], lo, hi) / 4).toFixed(2) + "%" });
  const hv = hov == null ? null : Math.max(0, Math.min(n - 1, hov));
  const ri = hv ?? n - 1;
  const shownPx = hv == null ? fund.price : pts[ri];
  const shownChg = hv == null ? chg : (pts[ri] / pts[0] - 1) * 100;
  const shownAbs = hv == null ? fund.price - fund.price / (1 + chg / 100) : pts[ri] - pts[0];

  const lo5 = Math.min(...p5), hi5 = Math.max(...p5);
  const mY = (p: number) => (6 + (1 - (p - lo5) / (hi5 - lo5)) * 48).toFixed(1);
  const mX = (k: number) => ((k / (N5 - 1)) * 1000).toFixed(1);
  const mini = "M" + p5.map((p, k) => `${mX(k)},${mY(p)}`).join(" L");
  const miniSel = "M" + p5.slice(i0, i1 + 1).map((p, k) => `${mX(i0 + k)},${mY(p)}`).join(" L");
  const months = Math.max(0, Math.round((br[1] - br[0]) * 60));

  const axis = custom ? [0, 0.25, 0.5, 0.75, 1].map((q) => rangeDate(br[0] + (br[1] - br[0]) * q)) : TF[tf].axis;
  const end = at(n - 1);
  const pt = hv != null ? at(hv) : { x: "0%", y: "0%" };

  const pick = (k: ChartTf) => { setTf(k); setHov(null); setCustom(null); };

  const startDrag = (mode: "M" | "L" | "R") => (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const el = miniRef.current; if (!el) return;
    const W = el.getBoundingClientRect().width, [a, b] = br, x0 = e.clientX, MIN = 0.03;
    const move = (ev: MouseEvent) => {
      const d = (ev.clientX - x0) / W;
      let na = a, nb = b;
      if (mode === "L") na = Math.max(0, Math.min(b - MIN, a + d));
      else if (mode === "R") nb = Math.min(1, Math.max(a + MIN, b + d));
      else { const w = Math.max(MIN, b - a); na = Math.max(0, Math.min(1 - w, a + d)); nb = na + w; }
      setCustom([na, nb]); setHov(null);
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHov(Math.round(((e.clientX - r.left) / r.width) * (n - 1)));
  };

  const handle = "absolute top-1/2 -mt-[15px] flex h-[30px] w-2.5 cursor-ew-resize items-center justify-center gap-0.5 border border-emerald-400 bg-black";

  return (
    <div className="flex flex-none flex-col gap-3">
      <div className={`${SURFACE} flex h-[540px] flex-col`}>
        {/* ── Header: timeframe (left) · price + Δ for that timeframe (right) ── */}
        <div className="flex flex-none flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-white/[0.05] px-4 py-3">
          <div role="tablist" aria-label="Timeframe" className="flex items-center rounded-lg border border-white/[0.05] bg-[#030303] p-0.5">
            {CHART_TFS.map((k) => {
              const on = k === tf && !custom;
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => pick(k)}
                  className={`h-7 min-w-[38px] rounded-md px-2 font-mono text-[11px] font-bold tracking-[0.04em] transition-colors ${
                    on ? "bg-white/[0.08] text-emerald-400 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.35)]" : "text-zinc-500 hover:text-zinc-100"
                  }`}
                >
                  {k}
                </button>
              );
            })}
            {custom && (
              <button type="button" onClick={() => { setCustom(null); setHov(null); }} className="ml-0.5 h-7 rounded-md bg-white/[0.08] px-2 font-mono text-[11px] font-bold text-emerald-400 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.35)]" title="Reset to timeframe">
                RANGE ×
              </button>
            )}
          </div>

          <div className="ml-auto flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1 whitespace-nowrap font-mono tabular-nums">
            <span className="hidden text-[10px] tracking-[0.12em] text-zinc-600 sm:inline">
              {hv == null ? `${fund.tic} · LAST` : `PT ${String(hv + 1).padStart(3, "0")}/${n}`}
            </span>
            <span className="text-[22px] font-semibold leading-none tracking-[-0.01em] text-neutral-50">{usd(shownPx)}</span>
            <span className="flex items-baseline gap-1.5 text-[13px] font-bold" style={{ color: shownChg >= 0 ? GAIN : LOSS }}>
              {(shownAbs >= 0 ? "+" : "−") + Math.abs(shownAbs).toFixed(2)}
              <span>({sg(shownChg)})</span>
            </span>
            <span className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.12em] text-zinc-400">{label}</span>
          </div>
        </div>

        {/* ── Main chart ── */}
        <div onMouseMove={onMove} onMouseLeave={() => setHov(null)} className="relative mt-3.5 min-h-[150px] flex-1 cursor-crosshair">
          <svg viewBox="0 0 1000 400" preserveAspectRatio="none" className="absolute inset-0 block h-full w-full">
            <defs>
              <linearGradient id="dvFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={col} stopOpacity="0.22" />
                <stop offset="0.55" stopColor={col} stopOpacity="0.05" />
                <stop offset="1" stopColor={col} stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((q) => (
              <line key={q} x1="0" x2="1000" y1={30 + q * 360} y2={30 + q * 360} stroke="rgba(255,255,255,0.04)" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={`${line} L1000,400 L0,400 Z`} fill="url(#dvFill)" stroke="none" />
            <path d={line} fill="none" stroke={col} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          <div className="absolute right-3.5 top-0 font-mono text-[10px] text-zinc-600">H <span className="text-zinc-400">{usd(hi)}</span></div>
          <div className="absolute bottom-1.5 right-3.5 font-mono text-[10px] text-zinc-600">L <span className="text-zinc-400">{usd(lo)}</span></div>
          <div className="absolute -ml-[3.5px] -mt-[3.5px] h-[7px] w-[7px]" style={{ left: end.x, top: end.y, background: col }} />
          {hv != null && (
            <>
              <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-white/[0.18]" style={{ left: pt.x }} />
              <div className="pointer-events-none absolute -ml-[4.5px] -mt-[4.5px] h-[9px] w-[9px] border-2 bg-black" style={{ left: pt.x, top: pt.y, borderColor: col }} />
            </>
          )}
        </div>

        <div className="flex flex-none justify-between px-4 pb-2.5 pt-2 font-mono text-[9.5px] tracking-[0.08em] text-zinc-600">
          {axis.map((x) => <span key={x}>{x}</span>)}
        </div>

        {/* ── Mini-map / brush ── */}
        <div className="flex flex-none flex-col gap-1.5 px-4 pb-4">
          <div className="flex items-center justify-between gap-2.5 whitespace-nowrap font-mono text-[9.5px] tracking-[0.1em] text-zinc-600">
            <span>RANGE <span className="text-neutral-200">{rangeDate(br[0])} → {rangeDate(br[1])}</span> <span className="text-zinc-500">· {months >= 1 ? months + "M" : "<1M"}</span></span>
            <span className="text-zinc-700">DRAG TO ZOOM</span>
          </div>
          <div ref={miniRef} className="relative h-16 select-none rounded-xl border border-white/[0.05] bg-[#030303]">
            <svg viewBox="0 0 1000 64" preserveAspectRatio="none" className="absolute inset-0 block h-full w-full">
              <path d={`${mini} L1000,64 L0,64 Z`} fill="rgba(255,255,255,0.03)" stroke="none" />
              <path d={mini} fill="none" stroke="#3f3f46" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <path d={miniSel} fill="none" stroke={col} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
            </svg>
            {[2022, 2023, 2024, 2025, 2026].map((y) => (
              <span key={y} className="pointer-events-none absolute bottom-0.5 ml-[3px] border-l border-zinc-800 pl-[3px] font-mono text-[8.5px] text-zinc-700" style={{ left: (((12 * (y - 2021) - 8) / 60) * 100).toFixed(2) + "%" }}>{y}</span>
            ))}
            <div className="pointer-events-none absolute bottom-0 left-0 top-0 rounded-l-xl bg-black/60" style={{ width: (br[0] * 100).toFixed(2) + "%" }} />
            <div className="pointer-events-none absolute bottom-0 right-0 top-0 rounded-r-xl bg-black/60" style={{ width: ((1 - br[1]) * 100).toFixed(2) + "%" }} />
            <div
              onMouseDown={startDrag("M")}
              className="absolute -bottom-px -top-px cursor-grab border-y border-emerald-400 bg-emerald-400/[0.07]"
              style={{ left: (br[0] * 100).toFixed(2) + "%", width: `max(6px, ${((br[1] - br[0]) * 100).toFixed(2)}%)` }}
            >
              <div onMouseDown={startDrag("L")} className={`${handle} -left-[5px]`}><span className="h-3.5 w-px bg-emerald-400" /><span className="h-3.5 w-px bg-emerald-400" /></div>
              <div onMouseDown={startDrag("R")} className={`${handle} -right-[5px]`}><span className="h-3.5 w-px bg-emerald-400" /><span className="h-3.5 w-px bg-emerald-400" /></div>
            </div>
          </div>
        </div>
      </div>

      <MetricsGrid stats={fund.stats} />
    </div>
  );
}
