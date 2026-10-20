"use client";

/* Small, dismissible risk notes ("bubbles") for investors:
   · OverlapNotice      — portfolio: ETFs that largely hold the same stocks (overview + composition)
   · ConcentrationNotice — ETF: a few holdings carry most of the weight (overview + composition)
   Closing one hides it for that exact situation (remembered in the browser); if the overlap / concentration
   changes, a new note appears. Calculations use the tracked holdings of each fund profile. */

import { useMemo } from "react";
import type { ReactNode } from "react";
import { usePersisted } from "@/lib/persisted";
import { etfOverlaps, type Position } from "@/lib/portfolio";
import type { FundData } from "@/components/deep-view/types";

/** pair overlap that is worth a note: ≥ 10% of weight in common, or ≥ 10 shared names */
const OVERLAP_PCT = 10, OVERLAP_NAMES = 10;
/** fund concentration worth a note */
const TOP5_PCT = 40, TOP1_PCT = 15;

function Bubble({ id, title, children, foot }: { id: string; title: string; children: ReactNode; foot?: string }) {
  const [closed, setClosed] = usePersisted<boolean>(`oasis.notice.${id}`, false);
  if (closed) return null;
  return (
    <div role="note" className="relative flex flex-none items-start gap-2.5 rounded-sm border border-amber-400/40 bg-amber-400/[0.06] py-2 pl-3 pr-9 font-mono text-[11px] leading-snug text-amber-100/90">
      <span className="mt-px flex-none text-amber-400" aria-hidden>⚠</span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[10px] font-bold tracking-[0.14em] text-amber-300">{title}</span>
        <div className="font-sans text-[12px] text-zinc-200">{children}</div>
        {foot && <span className="text-[9.5px] tracking-[0.06em] text-zinc-500">{foot}</span>}
      </div>
      <button type="button" onClick={() => setClosed(true)} aria-label="Dismiss this note" title="Dismiss"
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-sm text-[14px] text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-white">×</button>
    </div>
  );
}

const fmt = (v: number) => `${v.toFixed(v >= 10 ? 0 : 1)}%`;

export function OverlapNotice({ positions }: { positions: Position[] }) {
  const pairs = useMemo(() => etfOverlaps(positions).filter((p) => p.pct >= OVERLAP_PCT || p.shared >= OVERLAP_NAMES), [positions]);
  if (!pairs.length) return null;
  const sig = pairs.slice(0, 3).map((p) => `${p.a}-${p.b}-${Math.round(p.pct / 5)}`).join("_");
  const etfCount = new Set(pairs.flatMap((p) => [p.a, p.b])).size;
  return (
    <Bubble id={`overlap.${sig}`} title={`ETF OVERLAP · ${etfCount} OF YOUR ETFS HOLD THE SAME STOCKS`}
      foot="Overlap = sum of the smaller weight of each shared stock (tracked top holdings of each fund). High overlap means less diversification than the number of funds suggests.">
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {pairs.slice(0, 3).map((p) => (
          <li key={p.a + p.b}>
            <span className="font-mono font-bold text-white">{p.a}</span> &amp; <span className="font-mono font-bold text-white">{p.b}</span> share{" "}
            <span className="font-semibold text-amber-300">{p.shared} stocks</span> · <span className="font-semibold text-amber-300">{fmt(p.pct)}</span> of their weight is the same
            <span className="text-zinc-500"> ({p.top.join(", ")}{p.shared > p.top.length ? " …" : ""})</span>
          </li>
        ))}
        {pairs.length > 3 && <li className="text-zinc-500">+{pairs.length - 3} more overlapping pair{pairs.length - 3 > 1 ? "s" : ""}</li>}
      </ul>
    </Bubble>
  );
}

/** concentration signals from the Composition Map explorer (level + skew chips) — shown inside the same box */
export interface ConcentrationSignals { level: "LOW" | "ELEVATED" | "CRITICAL"; top5: number; chips: string[]; levelText: string }

export function ConcentrationNotice({ fund, signals }: { fund: FundData; signals?: ConcentrationSignals }) {
  const c = useMemo(() => {
    const hs = fund.holdings.filter((h) => h.w > 0);
    const top5 = hs.slice(0, 5).reduce((t, h) => t + h.w, 0);
    const top1 = hs[0];
    return { top5, top1, names: hs.slice(0, 3).map((h) => h.tic) };
  }, [fund.holdings]);
  const flagged = !!c.top1 && (c.top5 >= TOP5_PCT || c.top1.w >= TOP1_PCT || (signals != null && signals.level !== "LOW"));
  if (!flagged || !c.top1) return null;
  return (
    <Bubble id={`conc.${fund.tic}.${Math.round(c.top5 / 5)}`} title={`HIGH CONCENTRATION · ${fund.tic}`}
      foot={`From the fund's tracked holdings · ${fund.positions} positions in total.`}>
      The top 5 holdings make up <span className="font-semibold text-amber-300">{fmt(c.top5)}</span> of the fund
      {c.top1.w >= TOP1_PCT && <> — <span className="font-mono font-bold text-white">{c.top1.tic}</span> alone is <span className="font-semibold text-amber-300">{fmt(c.top1.w)}</span></>}.
      {" "}Returns depend heavily on a few companies ({c.names.join(", ")}).
      {signals && (
        <span className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[10px] font-bold tracking-[0.06em]">
          <span title={signals.levelText} className={`rounded-xs border px-1.5 py-0.5 ${signals.level === "CRITICAL" ? "border-[#ff6a00]/70 text-[#ff8a3d]" : signals.level === "ELEVATED" ? "border-amber-500/60 text-amber-400" : "border-emerald-400/50 text-emerald-400"}`}>
            {signals.level === "LOW" ? "✓" : "⚠"} {signals.level} · TOP 5 = {signals.top5.toFixed(1)}%
          </span>
          {signals.chips.map((ch) => <span key={ch} className="rounded-xs border border-amber-500/50 px-1.5 py-0.5 text-amber-400">⚠ {ch}</span>)}
        </span>
      )}
    </Bubble>
  );
}
