"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { FundData, Tf } from "./types";
import { BRUSH_PRESET, TF, TF_KEYS, makeSeries } from "./mockData";
import { rangeDate, sg, usd } from "./utils";

const axisY = (p: number, lo: number, hi: number) => 30 + (1 - (p - lo) / (hi - lo || 1)) * 360;
const GAIN = "#34D399", LOSS = "#F87171";

export default function PriceChart({ fund }: { fund: FundData }) {
  const [tf, setTf] = useState<Tf>("YTD");
  const [custom, setCustom] = useState<[number, number] | null>(null);
  const [hov, setHov] = useState<number | null>(null);
  const miniRef = useRef<HTMLDivElement>(null);

  const p5 = useMemo(() => makeSeries("5Y", fund.price, fund.perf["5Y"], fund.tic, fund.volMul), [fund]);
  const tfSeries = useMemo(() => makeSeries(tf, fund.price, fund.perf[tf], fund.tic, fund.volMul), [tf, fund]);
  const N5 = p5.length;
  const br = custom ?? BRUSH_PRESET[tf];
  const brRef = useRef(br);
  brRef.current = br;

  const i0 = Math.round(br[0] * (N5 - 1));
  const i1 = Math.max(i0 + 1, Math.round(br[1] * (N5 - 1)));
  const pts = custom ? p5.slice(i0, i1 + 1) : tfSeries;
  const n = pts.length, lo = Math.min(...pts), hi = Math.max(...pts);
  const chg = custom ? (pts[n - 1] / pts[0] - 1) * 100 : fund.perf[tf];
  const col = chg >= 0 ? GAIN : LOSS;
  const label = custom ? "RANGE" : tf;

  const line = "M" + pts.map((p, i) => `${((i / (n - 1)) * 1000).toFixed(1)},${axisY(p, lo, hi).toFixed(1)}`).join(" L");
  const at = (i: number) => ({ x: ((i / (n - 1)) * 100).toFixed(2) + "%", y: (axisY(pts[i], lo, hi) / 4).toFixed(2) + "%" });
  const hv = hov == null ? null : Math.max(0, Math.min(n - 1, hov));
  const ri = hv ?? n - 1;
  const rc = (pts[ri] / pts[0] - 1) * 100;

  const lo5 = Math.min(...p5), hi5 = Math.max(...p5);
  const mY = (p: number) => (6 + (1 - (p - lo5) / (hi5 - lo5)) * 48).toFixed(1);
  const mX = (k: number) => ((k / (N5 - 1)) * 1000).toFixed(1);
  const mini = "M" + p5.map((p, k) => `${mX(k)},${mY(p)}`).join(" L");
  const miniSel = "M" + p5.slice(i0, i1 + 1).map((p, k) => `${mX(i0 + k)},${mY(p)}`).join(" L");
  const months = Math.max(0, Math.round((br[1] - br[0]) * 60));

  const axis = custom ? [0, 0.25, 0.5, 0.75, 1].map((q) => rangeDate(br[0] + (br[1] - br[0]) * q)) : TF[tf].axis;
  const end = at(n - 1);
  const pt = hv != null ? at(hv) : { x: "0%", y: "0%" };

  const startDrag = useCallback((mode: "M" | "L" | "R") => (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const el = miniRef.current; if (!el) return;
    const W = el.getBoundingClientRect().width, [a, b] = brRef.current, x0 = e.clientX, MIN = 0.03;
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
  }, []);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHov(Math.round(((e.clientX - r.left) / r.width) * (n - 1)));
  };

  const handle = "absolute top-1/2 -mt-[15px] flex h-[30px] w-2.5 cursor-ew-resize items-center justify-center gap-0.5 border border-emerald-400 bg-black shadow-[0_0_8px_rgba(52,211,153,0.4)]";

  return (
    <div className="flex h-[560px] flex-none flex-col rounded-3xl border border-white/[0.04] bg-[#121214] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
      <div className="flex min-h-[42px] flex-none flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-gray-900 px-4 py-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-2.5 overflow-hidden whitespace-nowrap font-mono tabular-nums">
          <span className="font-display text-[10px] font-bold tracking-[0.18em] text-gray-500">PRICE · USD</span>
          <span className="text-[13px] font-semibold text-neutral-100">{usd(pts[ri])}</span>
          <span className="text-[11px] font-bold" style={{ color: rc >= 0 ? GAIN : LOSS }}>{sg(rc)}</span>
          <span className="text-[10px] text-gray-600">{hv == null ? `${label} · LAST` : `${label} · PT ${String(hv + 1).padStart(3, "0")}/${n}`}</span>
        </div>
        <div className="flex flex-none items-center gap-2.5">
          {TF_KEYS.map((k, i) => {
            const on = k === tf && !custom;
            return (
              <span key={k} className="flex items-center gap-2.5">
                {i > 0 && <span className="font-mono text-[11px] text-neutral-800">|</span>}
                <button
                  type="button"
                  onClick={() => { setTf(k); setHov(null); setCustom(null); }}
                  className={`border-b pb-0.5 pt-[3px] font-mono text-[11px] font-bold tracking-[0.06em] hover:text-white ${on ? "border-emerald-400 text-emerald-400 [text-shadow:0_0_8px_rgba(52,211,153,0.5)]" : "border-transparent text-gray-500"}`}
                >
                  {k}
                </button>
              </span>
            );
          })}
        </div>
      </div>

      <div onMouseMove={onMove} onMouseLeave={() => setHov(null)} className="relative mt-3.5 min-h-[150px] flex-1 cursor-crosshair">
        <svg viewBox="0 0 1000 400" preserveAspectRatio="none" className="absolute inset-0 block h-full w-full">
          <defs>
            <linearGradient id="dvFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={col} stopOpacity="0.26" />
              <stop offset="0.55" stopColor={col} stopOpacity="0.06" />
              <stop offset="1" stopColor={col} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L1000,400 L0,400 Z`} fill="url(#dvFill)" stroke="none" />
          <path d={line} fill="none" stroke={col} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        <div className="absolute right-3.5 top-0 font-mono text-[10px] text-gray-600">H <span className="text-gray-400">{usd(hi)}</span></div>
        <div className="absolute bottom-1.5 right-3.5 font-mono text-[10px] text-gray-600">L <span className="text-gray-400">{usd(lo)}</span></div>
        <div className="absolute -ml-[3.5px] -mt-[3.5px] h-[7px] w-[7px]" style={{ left: end.x, top: end.y, background: col, boxShadow: `0 0 10px ${col}` }} />
        {hv != null && (
          <>
            <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-white/[0.18]" style={{ left: pt.x }} />
            <div className="pointer-events-none absolute -ml-[4.5px] -mt-[4.5px] h-[9px] w-[9px] border-2 bg-black" style={{ left: pt.x, top: pt.y, borderColor: col }} />
          </>
        )}
      </div>

      <div className="flex flex-none justify-between px-4 pb-2.5 pt-2 font-mono text-[9.5px] tracking-[0.08em] text-gray-600">
        {axis.map((x) => <span key={x}>{x}</span>)}
      </div>

      <div className="flex flex-none flex-col gap-1.5 px-4 pb-3">
        <div className="flex items-center justify-between gap-2.5 whitespace-nowrap font-mono text-[9.5px] tracking-[0.1em] text-gray-600">
          <span>RANGE <span className="text-neutral-200">{rangeDate(br[0])} → {rangeDate(br[1])}</span> <span className="text-gray-500">· {months >= 1 ? months + "M" : "<1M"}</span></span>
          {custom && <button type="button" onClick={() => { setCustom(null); setHov(null); }} className="text-gray-500 hover:text-white">[ RESET ]</button>}
        </div>
        <div ref={miniRef} className="relative h-16 select-none rounded-xl border border-white/[0.03] bg-black/30">
          <svg viewBox="0 0 1000 64" preserveAspectRatio="none" className="absolute inset-0 block h-full w-full">
            <path d={`${mini} L1000,64 L0,64 Z`} fill="rgba(255,255,255,0.035)" stroke="none" />
            <path d={mini} fill="none" stroke="#374151" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <path d={miniSel} fill="none" stroke={col} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          </svg>
          {[2022, 2023, 2024, 2025, 2026].map((y) => (
            <span key={y} className="pointer-events-none absolute bottom-0.5 ml-[3px] border-l border-gray-800 pl-[3px] font-mono text-[8.5px] text-gray-700" style={{ left: (((12 * (y - 2021) - 8) / 60) * 100).toFixed(2) + "%" }}>{y}</span>
          ))}
          <div className="pointer-events-none absolute bottom-0 left-0 top-0 bg-black/55" style={{ width: (br[0] * 100).toFixed(2) + "%" }} />
          <div className="pointer-events-none absolute bottom-0 right-0 top-0 bg-black/55" style={{ width: ((1 - br[1]) * 100).toFixed(2) + "%" }} />
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

      <div className="grid flex-none grid-cols-2 border-t border-gray-900">
        <div className="flex min-w-0 flex-col gap-1 border-l border-gray-900 px-4 py-2.5">
          <span className="whitespace-nowrap text-[9px] font-bold tracking-[0.18em] text-gray-600">{label} CHG</span>
          <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold" style={{ color: col }}>{sg(chg)}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-1 border-l border-gray-900 px-4 py-2.5">
          <span className="whitespace-nowrap text-[9px] font-bold tracking-[0.18em] text-gray-600">NAV / PREM</span>
          <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-neutral-200">{usd(fund.nav[0])} · {sg(fund.nav[1])}</span>
        </div>
      </div>
    </div>
  );
}
