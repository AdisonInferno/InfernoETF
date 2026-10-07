"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FundData } from "./types";
import { BREADTH, MONTHS } from "./mockData";

const CARD = "rounded-[18px] border border-white/[0.04] bg-[#121214]";

function heat(v: number | null, wide: boolean) {
  if (v == null) return { v: "·", bg: "transparent", fg: "#4B5563", fw: 400 };
  const t = Math.min(1, Math.abs(v) / 15), a = (0.16 + 0.24 * t).toFixed(2);
  return {
    v: wide ? (v > 0 ? "+" : "") + (Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(1)) : String(Math.round(v)),
    bg: Math.abs(v) < 0.5 ? "transparent" : v >= 0 ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})`,
    fg: t > 0.5 ? "#FFFFFF" : "#E5E7EB", fw: t > 0.5 ? 700 : 500,
  };
}
const sg1 = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(1);

function BreadthChart() {
  const d = useMemo(() => {
    const { S, E } = BREADTH, n = S.length, all = S.concat(E), lo = Math.min(...all, 100), hi = Math.max(...all);
    const y = (v: number) => 12 + (1 - (v - lo) / (hi - lo)) * 256, x = (i: number) => ((i / (n - 1)) * 1000).toFixed(1);
    const ln = (A: number[]) => "M" + A.map((v, i) => `${x(i)},${y(v).toFixed(1)}`).join(" L");
    const spread = ln(S) + " L" + E.slice().reverse().map((v, k) => `${x(n - 1 - k)},${y(v).toFixed(1)}`).join(" L") + " Z";
    const pct = (v: number) => ((y(v) / 280) * 100).toFixed(2) + "%";
    const sr = S[n - 1] - 100, er = E[n - 1] - 100, sp = sr - er;
    return {
      cap: ln(S), eq: ln(E), spread, baseY: y(100).toFixed(1), baseTop: pct(100), capTop: pct(S[n - 1]), eqTop: pct(E[n - 1]),
      capEnd: S[n - 1].toFixed(0), eqEnd: E[n - 1].toFixed(0),
      stats: [
        { l: "CAP-WEIGHT 5Y", v: "+" + sr.toFixed(1) + "%", c: "#34D399" }, { l: "EQUAL-WEIGHT 5Y", v: "+" + er.toFixed(1) + "%", c: "#22D3EE" },
        { l: "SPREAD", v: "+" + sp.toFixed(1) + " pp", c: "#FFFFFF" }, { l: "TOP-10 SHARE OF S&P", v: "38.2%", c: "#F5A524" },
        { l: "BREADTH REGIME", v: sp > 25 ? "▲ NARROW" : "BROAD", c: sp > 25 ? "#FF4D4D" : "#4ADE80" },
      ],
    };
  }, []);

  return (
    <div className={`m-3 mt-6 flex flex-col font-mono tabular-nums ${CARD}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/[0.06] px-[18px] py-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-bold tracking-[0.1em] text-neutral-200">[ S&amp;P 500: MARKET-CAP vs. EQUAL-WEIGHT SPREAD ]</span>
          <span title="Market breadth: when cap-weighted (SPY) outruns equal-weighted (RSP), gains are concentrated in a few mega-caps. A widening spread = narrow participation; a shrinking spread = healthy, broad rally." className="flex h-5 cursor-help items-center gap-[5px] border border-gray-800 px-[7px] text-[9.5px] font-bold tracking-[0.1em] text-gray-400 hover:border-gray-700 hover:text-white">ⓘ MARKET BREADTH</span>
        </div>
        <div className="flex items-center gap-4 whitespace-nowrap text-[10px] tracking-[0.08em] text-gray-400">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 bg-emerald-400" />CAP-WEIGHT · SPY</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 bg-cyan-400" />EQUAL-WEIGHT · RSP</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 border border-emerald-400/30 bg-emerald-400/[0.14]" />SPREAD</span>
        </div>
      </div>
      <div className="relative ml-[18px] mr-[70px] mt-4 h-[280px]">
        <svg viewBox="0 0 1000 280" preserveAspectRatio="none" className="absolute inset-0 block h-full w-full overflow-visible">
          <defs>
            <linearGradient id="cSpread" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#34D399" stopOpacity="0.02" />
              <stop offset="1" stopColor="#34D399" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <line x1="0" x2="1000" y1={d.baseY} y2={d.baseY} stroke="#1F2937" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <path d={d.spread} fill="url(#cSpread)" stroke="none" />
          <path d={d.eq} fill="none" stroke="#22D3EE" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <path d={d.cap} fill="none" stroke="#34D399" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        <span className="absolute right-0 mt-[3px] text-[9px] text-gray-600" style={{ top: d.baseTop }}>BASE 100</span>
        <span className="absolute left-full -mt-[9px] ml-2 bg-emerald-400 px-[5px] py-px text-[10px] font-bold text-black" style={{ top: d.capTop }}>{d.capEnd}</span>
        <span className="absolute left-full -mt-[9px] ml-2 bg-cyan-400 px-[5px] py-px text-[10px] font-bold text-black" style={{ top: d.eqTop }}>{d.eqEnd}</span>
      </div>
      <div className="ml-[18px] mr-[70px] flex justify-between pb-3 pt-2 text-[9.5px] tracking-[0.08em] text-gray-600">
        {["2021", "2022", "2023", "2024", "2025", "2026"].map((y) => <span key={y}>{y}</span>)}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] border-t border-white/[0.06]">
        {d.stats.map((st) => (
          <div key={st.l} className="flex min-w-0 flex-col gap-[5px] border-l border-gray-900 px-[18px] py-3">
            <span className="whitespace-nowrap text-[9px] font-bold tracking-[0.16em] text-gray-500">{st.l}</span>
            <span className="whitespace-nowrap text-sm font-semibold" style={{ color: st.c }}>{st.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Seasonality({ fund }: { fund: FundData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver((en) => setWide(en[0].contentRect.width >= 360));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const d = useMemo(() => {
    const seas = fund.seasonality;
    const avg = MONTHS.map((_, m) => { const v = seas.map((y) => y[1][m]).filter((x): x is number => x != null); return v.reduce((a, b) => a + b, 0) / v.length; });
    const flat = seas.flatMap((y) => y[1]).filter((x): x is number => x != null);
    const hit = flat.filter((x) => x > 0).length / flat.length;
    const bi = avg.indexOf(Math.max(...avg)), wi = avg.indexOf(Math.min(...avg));
    const yt = (v: (number | null)[]) => (v.filter((x): x is number => x != null).reduce((q, x) => q * (1 + x / 100), 1) - 1) * 100;
    const tots = seas.map(([, v]) => yt(v));
    const full = tots.slice(0, 3), ta = full.reduce((q, x) => q + x, 0) / full.length;
    const tc = (t: number, tn: string) => ({ t: (t >= 0 ? "+" : "") + t.toFixed(1), tn, tb: t >= 0 ? `rgba(34,197,94,${Math.min(0.55, 0.2 + Math.abs(t) / 200).toFixed(2)})` : `rgba(239,68,68,${Math.min(0.55, 0.2 + Math.abs(t) / 200).toFixed(2)})` });
    const row = (y: string, vals: (number | null)[], isAvg: boolean) => ({ y, isAvg, cells: vals.map((v, m) => ({ ...heat(v, wide), ...(isAvg && v != null ? { fg: "#FFFFFF", fw: 700 } : {}), tip: `${MONTHS[m]} ${y} · ${v == null ? "n/a" : sg1(v) + "%"}` })) });
    const rows = seas.map(([y, v], i) => ({ ...row(String(y), v, false), ...tc(tots[i], y === 2026 ? "2026 YTD (compounded)" : `${y} full year (compounded)`) }))
      .concat([{ ...row("AVG", avg.map((v) => +v.toFixed(1)), true), ...tc(ta, "Avg full-year return 2023–25") }]);
    return { rows, stats: [
      { l: "BEST", v: `${MONTHS[bi]} ${sg1(avg[bi])}`, c: "#4ADE80" }, { l: "WORST", v: `${MONTHS[wi]} ${sg1(avg[wi])}`, c: "#F87171" }, { l: "HIT RATE", v: Math.round(hit * 100) + "%", c: "#FFFFFF" },
    ] };
  }, [fund.seasonality, wide]);

  return (
    <div ref={ref} className={`mx-3 mb-3 flex min-w-0 flex-col ${CARD}`}>
      <div className="flex flex-col gap-2.5 p-6 font-mono tabular-nums">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[10.5px] font-bold tracking-[0.18em] text-neutral-300">SEASONALITY MATRIX</span>
          <span className="whitespace-nowrap text-[9.5px] text-gray-600">MONTHLY % · 2023–26</span>
        </div>
        <div className="grid grid-cols-[52px_repeat(12,minmax(0,1fr))_72px] gap-[3px] text-xs">
          <span />
          {MONTHS.map((m) => <span key={m} className="pb-[3px] text-center text-[9.5px] font-bold text-gray-400">{m[0]}</span>)}
          <span className="pb-[3px] text-center text-[9.5px] font-bold text-gray-200">Σ YR</span>
          {d.rows.map((r) => (
            <div key={r.y} className="contents">
              <span className={`flex items-center text-[10px] font-bold ${r.isAvg ? "mt-1 text-white" : "text-gray-400"}`}>{r.y}</span>
              {r.cells.map((c, i) => (
                <span key={i} title={c.tip} className={`flex h-[34px] min-w-0 items-center justify-center overflow-hidden whitespace-nowrap hover:outline hover:outline-1 hover:outline-gray-200 ${r.isAvg ? "mt-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]" : ""}`} style={{ background: c.bg, color: c.fg, fontWeight: c.fw }}>{c.v}</span>
              ))}
              <span title={r.tn} className={`flex h-[34px] items-center justify-center whitespace-nowrap font-bold text-white ${r.isAvg ? "mt-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]" : ""}`} style={{ background: r.tb }}>{r.t}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-x-2.5 gap-y-1 text-[9.5px] tracking-[0.08em] text-gray-300">
          {d.stats.map((st) => <span key={st.l}>{st.l} <span className="font-bold" style={{ color: st.c }}>{st.v}</span></span>)}
        </div>
      </div>
    </div>
  );
}

export default function ChartsTab({ fund }: { fund: FundData }) {
  return (
    <>
      <BreadthChart />
      <Seasonality fund={fund} />
    </>
  );
}
