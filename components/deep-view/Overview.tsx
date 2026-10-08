"use client";

import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { FundData } from "./types";
import { COUNTRY_CODE } from "./mockData";
import { aumFmt, pctOf, squarify } from "./utils";
import PriceChart from "./PriceChart";

const CARD = "rounded-2xl border border-white/[0.05] bg-[#0a0a0c]";
const H_LABEL = "font-display text-[10.5px] font-bold tracking-[0.18em] text-neutral-300";
const SECTOR_RGB: Record<string, string> = {
  Technology: "16,185,129", Materials: "251,191,36", "Cash & Other": "148,163,184", Other: "113,113,122",
  Financials: "59,130,246", "Health Care": "236,72,153", Communication: "168,85,247", "Consumer Disc.": "249,115,22",
  "Consumer Staples": "132,204,22", Energy: "239,68,68", Industrials: "56,189,248", Utilities: "45,212,191",
  "Real Estate": "217,119,6", Commodities: "234,179,8", Crypto: "247,147,26", "Govt Bonds": "148,163,184",
};

interface Tip { sector: string; name: string; usd: string; pct: string; col: string; x: number; y: number }

function SectorBreakdown({ fund }: { fund: FundData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 250, H = 100, PXU = 3.6;

  const { tiles, nSecs } = useMemo(() => {
    const maxSub = Math.max(...fund.sectors.map((x) => x[1]));
    const groups: Record<string, { n: string; v: number }[]> = {};
    fund.sectors.forEach(([n, v]) => { const k = fund.sectorParent[n] ?? "Other"; (groups[k] ??= []).push({ n, v }); });
    const secs = Object.entries(groups)
      .map(([n, a]) => ({ n, a: a.sort((x, y) => y.v - x.v), v: a.reduce((t, x) => t + x.v, 0) }))
      .sort((a, b) => b.v - a.v);
    const tiles = squarify(secs, (s) => s.v, 0, 0, W, H).map(({ item: sc, x, y, w, h }) => {
      const c = SECTOR_RGB[sc.n] ?? "148,163,184";
      const c2 = sc.n === "Technology" ? "20,184,166" : c;
      const lbl = w * PXU > 90 && h * 2.2 > 40, hdU = lbl ? 22 / PXU : 0;
      const subs = squarify(sc.a, (z) => z.v, 0, 0, w, h - hdU).map(({ item: z, x: sx, y: sy, w: sw, h: sh }) => ({
        name: z.n, v: z.v, x: pctOf(sx, w), y: pctOf(sy, h - hdU), w: pctOf(sw, w), h: pctOf(sh, h - hdU),
        bg: `linear-gradient(135deg, rgba(${c},${(0.1 + (0.3 * z.v) / maxSub).toFixed(3)}), rgba(${c2},${(0.055 + (0.17 * z.v) / maxSub).toFixed(3)}))`,
        bgh: `linear-gradient(135deg, rgba(${c},0.55), rgba(${c2},0.32))`,
        bc: `rgba(${c},0.75)`, lc: `rgb(${c})`, show: sw * PXU > 76 && sh * 2.2 > 40,
      }));
      return {
        name: sc.n.toUpperCase(), pct: sc.v.toFixed(1) + "%", parent: sc.n, lbl, subs,
        x: pctOf(x, W), y: pctOf(y, H), w: pctOf(w, W), h: pctOf(h, H),
        bg: sc.n === "Technology" ? "linear-gradient(135deg, rgba(6,78,59,0.4), rgba(19,78,74,0.2))" : `rgba(${c},0.06)`,
        bc: `rgba(${c},0.45)`, lc: `rgb(${c})`,
      };
    });
    return { tiles, nSecs: secs.length };
  }, [fund]);

  const showTip = (sector: string, name: string, v: number, col: string) => (e: React.MouseEvent) => {
    const b = ref.current?.getBoundingClientRect(); if (!b) return;
    let x = e.clientX - b.left + 14; if (x > b.width - 190) x -= 200;
    const bn = fund.aumB * v / 100;
    setTip({ sector: sector.toUpperCase(), name, col, pct: v.toFixed(1) + "%", usd: bn >= 1 ? "$" + bn.toFixed(2) + "B" : "$" + Math.round(bn * 1000) + "M", x, y: Math.max(0, Math.min(e.clientY - b.top + 14, b.height - 84)) });
  };

  return (
    <div className={`flex h-full min-w-0 flex-col gap-4 p-7 font-mono tabular-nums ${CARD}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={H_LABEL}>SECTOR &amp; SUB-SECTOR BREAKDOWN</span>
        <span className="whitespace-nowrap text-[9.5px] text-gray-600">AUM {aumFmt(fund.aumB)} · {nSecs} SECTORS · {fund.sectors.length} SUB-SECTORS</span>
      </div>
      <div ref={ref} onMouseLeave={() => setTip(null)} className="relative min-h-[260px] flex-1 overflow-hidden rounded-xl border border-white/[0.03] bg-black/30">
        {tiles.map((sc) => (
          <div key={sc.name} className="absolute box-border overflow-hidden border" style={{ left: sc.x, top: sc.y, width: sc.w, height: sc.h, borderColor: sc.bc, background: sc.bg }}>
            {sc.lbl && <span className="pointer-events-none absolute left-2 top-1 z-[1] whitespace-nowrap text-[9.5px] font-bold tracking-[0.16em]" style={{ color: sc.lc }}>{sc.name} · {sc.pct}</span>}
            <div className="absolute inset-x-0 bottom-0" style={{ top: sc.lbl ? 22 : 0 }}>
              {sc.subs.map((sb) => (
                <div
                  key={sb.name}
                  onMouseMove={showTip(sc.parent, sb.name, sb.v, sb.lc)}
                  className="absolute box-border cursor-crosshair overflow-hidden border border-[#0c0c0e] bg-[image:var(--bg)] transition-[background,box-shadow] duration-100 hover:z-[2] hover:bg-[image:var(--bgh)] hover:shadow-[inset_0_0_0_1px_var(--bc)]"
                  style={{ left: sb.x, top: sb.y, width: sb.w, height: sb.h, "--bg": sb.bg, "--bgh": sb.bgh, "--bc": sb.bc } as CSSProperties}
                >
                  {sb.show && (
                    <div className="pointer-events-none flex flex-col gap-0.5 px-[9px] py-[7px]">
                      <span className="text-[11px] font-bold tracking-[0.04em] text-zinc-100">{sb.name}</span>
                      <span className="text-[11px]" style={{ color: sb.lc }}>{sb.v.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {tip && (
          <div className="pointer-events-none absolute z-[5] min-w-[170px] border border-gray-700 bg-black px-[11px] py-[9px]" style={{ left: tip.x, top: tip.y }}>
            <div className="text-[9px] tracking-[0.16em] text-gray-500">{tip.sector}</div>
            <div className="mb-1.5 mt-[3px] text-[12.5px] font-bold text-white">{tip.name}</div>
            <div className="flex justify-between gap-4 text-[11px]"><span className="text-gray-400">{tip.usd}</span><span className="font-bold" style={{ color: tip.col }}>{tip.pct}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

function TopHoldings({ fund }: { fund: FundData }) {
  const [exp, setExp] = useState(false);
  const rows = exp ? fund.holdings : fund.holdings.slice(0, 10);
  const canExpand = fund.holdings.length > 10;
  const maxW = fund.holdings[0].w;
  const top10 = fund.holdings.slice(0, 10).reduce((a, h) => a + h.w, 0);
  return (
    <div className={`flex h-full min-w-0 flex-col justify-between ${CARD}`}>
      <div className="flex flex-col gap-2.5 p-6 font-mono tabular-nums">
        <div className="flex items-baseline justify-between gap-2">
          <span className={H_LABEL}>TOP 10 HOLDINGS</span>
          <span className="whitespace-nowrap text-[9.5px] text-gray-600">{fund.positions} POS · TOP10 {top10.toFixed(1)}% · AS OF 09-25</span>
        </div>
        <div className="grid grid-cols-[20px_52px_minmax(0,1fr)_48px] gap-2.5 border-b border-gray-900 pb-[5px] text-[9px] font-bold tracking-[0.16em] text-gray-600">
          <span>#</span><span>TICKER</span><span /><span className="text-right">WT %</span>
        </div>
        <div className="-mt-1 flex flex-col">
          {rows.map((h, i) => (
            <div key={h.tic} title={h.name} className="grid h-5 flex-none grid-cols-[20px_52px_minmax(0,1fr)_48px] items-center gap-2.5 hover:bg-[#0b0b0b]">
              <span className="text-[9.5px] text-gray-600">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[11px] font-bold text-neutral-200">{h.tic}</span>
              <div className="h-[3px] bg-gray-900"><div className="h-full bg-neutral-300 opacity-75" style={{ width: ((h.w / maxW) * 100).toFixed(1) + "%" }} /></div>
              <span className="text-right text-[10.5px] text-neutral-300">{h.w.toFixed(2)}</span>
            </div>
          ))}
        </div>
        {canExpand && <button type="button" onClick={() => setExp((v) => !v)} className="flex h-6 items-center justify-center rounded-xl border border-white/[0.03] bg-black/30 text-[9.5px] font-semibold tracking-[0.14em] text-gray-500 hover:border-gray-700 hover:text-white">
          {exp ? "[ COLLAPSE ]" : `[ EXPAND ALL · ${fund.holdings.length} ]`}
        </button>}
      </div>
    </div>
  );
}

function GeoAllocation({ fund }: { fund: FundData }) {
  return (
    <div className={`flex h-full min-w-0 flex-col gap-4 p-7 font-mono tabular-nums ${CARD}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={H_LABEL}>GEOGRAPHIC ALLOCATION</span>
        <span className="whitespace-nowrap text-[9.5px] text-gray-600">{fund.geo.length} REGIONS</span>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {fund.geo.map(([name, v]) => {
          const big = v > 40, cc = COUNTRY_CODE[name], fh = Math.round(20 + v * 0.9) + "px";
          return (
            <div
              key={name}
              className="box-border flex min-w-0 items-center rounded-xl border border-white/[0.03] bg-black/30 px-[18px] py-4 transition-[border-color,box-shadow] hover:border-emerald-400 hover:shadow-[inset_0_0_18px_rgba(52,211,153,0.05)]"
              style={{ flex: `${Math.max(1, Math.round(v))} 1 ${big ? "100%" : "150px"}`, minHeight: Math.round(56 + v * 1.1), gap: big ? 24 : 12 }}
            >
              {cc ? (
                <div title={name} className="flex-none border border-white/[0.12] bg-cover bg-center" style={{ height: fh, aspectRatio: "3/2", backgroundImage: `url(https://flagcdn.com/w320/${cc}.png)` }} />
              ) : (
                <span className="flex flex-none items-center justify-center border border-dashed border-gray-700 text-[9px] tracking-[0.1em] text-gray-500" style={{ height: fh, aspectRatio: "3/2" }}>···</span>
              )}
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap font-display text-gray-300" style={{ fontSize: Math.round(12 + v * 0.14) }}>{name}</span>
                <span className="self-start border border-emerald-400/35 bg-emerald-400/[0.06] px-2 py-px text-white" style={{ fontSize: Math.round(12 + v * 0.36), fontWeight: v > 40 ? 800 : v > 8 ? 700 : v > 2 ? 600 : 500 }}>{v.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AiOversight({ note, onUpgrade }: { note: string; onUpgrade?: () => void }) {
  return (
    <div className={`flex h-full min-w-0 flex-col justify-center ${CARD}`}>
      <div className="px-6 py-4">
        <div className="relative flex flex-col gap-2 rounded-sm border border-purple-900/45 bg-[#0a0510] p-3 shadow-[inset_0_0_24px_rgba(147,51,234,0.06)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] leading-none text-purple-400">✦</span>
            <span className="whitespace-nowrap font-mono text-[10.5px] font-bold tracking-[0.12em] text-purple-200">AI OVERSIGHT // GEN-Z ALPHA</span>
            <span className="ml-auto whitespace-nowrap border border-[#ff2a2a] bg-[#ff2a2a]/[0.12] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.08em] text-[#ff4d4d]">[ LIMIT REACHED: 10/10 ]</span>
          </div>
          <div className="relative min-h-[90px]">
            <p className="pointer-events-none m-0 select-none font-mono text-[10.5px] leading-[1.6] text-purple-300 opacity-50 blur-[4px]">
              {note}
            </p>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-center">
              <span className="font-display text-sm font-bold tracking-[0.16em] text-white">UPGRADE TO INFERNO PRO</span>
              <span className="max-w-[260px] text-pretty font-display text-[11px] leading-[1.3] text-violet-300">Unlock unlimited AI insights and deep overlap analysis.</span>
              <button type="button" onClick={onUpgrade} className="mt-0.5 flex h-7 items-center border border-emerald-400 bg-emerald-400/[0.08] px-3.5 font-mono text-[11px] font-bold tracking-[0.14em] text-emerald-400 hover:bg-emerald-400 hover:text-black">
                [ INITIATE UPGRADE ]
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Overview({ fund, onUpgrade }: { fund: FundData; onUpgrade?: () => void }) {
  return (
    <div className="flex flex-none flex-col gap-6 px-5 pb-12 pt-6">
      <PriceChart fund={fund} />
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8"><SectorBreakdown fund={fund} /></div>
        <div className="min-w-0 lg:col-span-4"><TopHoldings fund={fund} /></div>
      </div>
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8"><GeoAllocation fund={fund} /></div>
        <div className="min-w-0 lg:col-span-4"><AiOversight note={fund.aiNote} onUpgrade={onUpgrade} /></div>
      </div>
    </div>
  );
}
