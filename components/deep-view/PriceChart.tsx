"use client";

import type { FundData, FundStats } from "./types";
import InfernoChart, { type ChartTf } from "@/components/InfernoChart";
import { sg } from "./utils";
import { METRIC_INFO, MODEL_NOTE } from "./metricInfo";

/* ─────────────────────────────────────────────────────────────
   Chart Overview
   ┌ timeframe selector ───────────────────── price · Δ% (tf) ┐
   │ line chart                                               │
   │ mini-map / brush                                         │
   └──────────────────────────────────────────────────────────┘
   [ Fund Profile | Income & Tracking | Risk | Quant ]  ← one compact strip
   ───────────────────────────────────────────────────────────── */


const SURFACE = "oasis-glass border border-white/[0.06] bg-[var(--oasis-panel)]";
const pct2 = (v: number) => v.toFixed(2) + "%";
/** 450.2 → "$450.2B", 0.84 → "$840M" */
const aumFmt = (b: number) => (b >= 1 ? "$" + b.toFixed(1) + "B" : "$" + Math.round(b * 1000) + "M");
/** 0.0945 → "0.0945%", 0.03 → "0.03%" */
const terFmt = (v: number) => v.toFixed(Math.abs(v * 100 - Math.round(v * 100)) > 1e-6 ? 4 : 2) + "%";

/* ── Metrics grid ─────────────────────────────────────────── */

type Tone = "up" | "down" | "flat";
interface Metric { label: string; value: string; tone?: Tone; hint: string; model?: boolean }
interface MetricGroup { title: string; items: [Metric, Metric] }

const TONE: Record<Tone, string> = { up: "text-emerald-400", down: "text-red-400", flat: "text-neutral-100" };
const toneOf = (v: number): Tone => (v > 0 ? "up" : v < 0 ? "down" : "flat");

function metricGroups(s: FundStats): MetricGroup[] {
  return [
    {
      title: "FUND PROFILE",
      items: [
        { label: "AUM", value: aumFmt(s.aumB), hint: METRIC_INFO.AUM },
        { label: "TER", value: terFmt(s.ter), hint: METRIC_INFO.TER },
      ],
    },
    {
      title: "INCOME & TRACKING",
      items: [
        { label: "DIV YIELD", value: pct2(s.divYield), hint: METRIC_INFO.DIV_YIELD },
        { label: "NAV / PREM", value: sg(s.navPrem), tone: toneOf(s.navPrem), hint: METRIC_INFO.NAV_PREM, model: true },
      ],
    },
    {
      title: "RISK PROFILE",
      items: [
        { label: "BETA", value: s.beta.toFixed(2), hint: METRIC_INFO.BETA, model: true },
        { label: "30D VOL", value: s.vol30d.toFixed(1) + "%", hint: METRIC_INFO.VOL_30D, model: true },
      ],
    },
    {
      title: "QUANT METRICS",
      items: [
        { label: "SHARPE", value: s.sharpe.toFixed(2), hint: METRIC_INFO.SHARPE, model: true },
        { label: "MAX DD", value: s.maxDD.toFixed(1) + "%", tone: "down", hint: METRIC_INFO.MAX_DD, model: true },
      ],
    },
  ];
}

/** One compact strip: the four existing categories side by side, each with its two metrics.
 *  Hover a label for its definition; "EST" marks numbers that come from the fund model, not a data feed. */
export function MetricsGrid({ stats }: { stats: FundStats }) {
  return (
    <div className={`${SURFACE} grid grid-cols-2 divide-white/[0.05] max-xl:gap-y-3 max-xl:py-3 xl:grid-cols-4 xl:divide-x`}>
      {metricGroups(stats).map((g) => (
        <section key={g.title} className="flex min-w-0 flex-col gap-1.5 px-4 xl:py-2.5">
          <h3 className="m-0 font-mono text-[9px] font-bold tracking-[0.2em] text-zinc-500">{g.title}</h3>
          <div className="grid grid-cols-2 gap-3">
            {g.items.map((m) => (
              <div key={m.label} className="flex min-w-0 flex-col gap-1" title={m.model ? `${m.hint}\n${MODEL_NOTE}` : m.hint}>
                <span className="flex items-center gap-1 whitespace-nowrap font-mono text-[9.5px] font-semibold tracking-[0.12em] text-zinc-500">
                  <span className="cursor-help underline decoration-white/15 decoration-dotted underline-offset-[3px]">{m.label}</span>
                  {m.model && <span className="rounded-xs border border-white/[0.08] px-[3px] text-[8px] tracking-[0.08em] text-zinc-600">EST</span>}
                </span>
                <span className={`whitespace-nowrap font-mono text-[16px] font-semibold leading-none tabular-nums tracking-[-0.01em] ${TONE[m.tone ?? "flat"]}`}>
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

/** `fill`: the chart takes all the height its parent gives it (zero-scroll Overview) instead of a fixed 520 px */
export default function PriceChart({ fund, initialTf = "1Y", fill = false }: { fund: FundData; initialTf?: ChartTf; fill?: boolean }) {
  return (
    <div className={`flex flex-col gap-2.5 ${fill ? "min-h-0 flex-1" : "flex-none"}`}>
      <section className={`flex flex-col rounded-sm border border-white/[0.05] bg-[var(--oasis-bg)] ${fill ? "min-h-[360px] flex-1 p-2.5 lg:min-h-0" : "h-[520px] p-3"}`}>
        <InfernoChart key={fund.tic} initialTf={initialTf}
          main={{ id: fund.tic, label: fund.tic, sym: fund.tic, color: "#f87171" }}
          pinned={[{ id: "SPY", label: "S&P 500", sym: "SPY", color: "#a1a1aa", dashed: true },
            ...fund.holdings.slice(0, 5).map((h, i) => ({ id: `top:${h.tic}`, label: h.tic, sym: h.tic, color: ["#60a5fa", "#f59e0b", "#f472b6", "#22d3ee", "#a3e635"][i] }))].filter((l) => l.sym !== fund.tic)}
          picker={fund.holdings.map((h) => ({ sym: h.tic, label: h.tic, sub: `${h.w.toFixed(2)}% · ${h.name}` }))} />
      </section>
      <MetricsGrid stats={fund.stats} />
    </div>
  );
}
