"use client";

import type { FundData, FundStats } from "./types";
import TradingChart from "./TradingChart";
import { sg } from "./utils";

/* ─────────────────────────────────────────────────────────────
   Chart Overview
   ┌ timeframe selector ───────────────────── price · Δ% (tf) ┐
   │ line chart                                               │
   │ mini-map / brush                                         │
   └──────────────────────────────────────────────────────────┘
   [ Fund Profile ] [ Income & Tracking ] [ Risk ] [ Quant ]
   ───────────────────────────────────────────────────────────── */


const SURFACE = "rounded-2xl border border-white/[0.05] bg-[#0a0a0c]";
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

/* ── Chart Overview = trading chart + metrics ─────────────── */

export default function PriceChart({ fund }: { fund: FundData }) {
  return (
    <div className="flex flex-none flex-col gap-3">
      <TradingChart fund={fund} />
      <MetricsGrid stats={fund.stats} />
    </div>
  );
}
