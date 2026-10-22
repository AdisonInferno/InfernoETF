"use client";

/* ─────────────────────────────────────────────────────────────
   PERFORMANCE DRIVERS — holding-level return attribution
     Contribution_i = Weight_i × Return_i   (percentage points of the fund's return)
   · returns: real closes over the selected window (useHoldingReturns — same numbers as the Composition Map)
   · holdings without price history are listed as N/A and LEFT OUT of the sum (never counted as 0%)
   · the gap between the fund's actual return and Σ contributions = untracked holdings, cash, fees,
     weight drift over the window — shown as its own line so nothing is hidden
   ───────────────────────────────────────────────────────────── */

import Link from "next/link";
import { useMemo, useState } from "react";
import { SegRail } from "@/components/InfernoChart";
import { PERIOD_LABEL, useHoldingReturns } from "./useHoldingReturns";
import ChartGrid, { GRID_TFS, type GridTf } from "@/components/ChartGrid";

export interface AttribHolding { tic: string; name: string; /** weight in the fund, % */ w: number; /** grouping (sector) for the cumulative view */ group?: string }

/* one timeline for the attribution AND the chart grid below it */
const PERIODS = GRID_TFS;
type P = GridTf;
/** grid = the fewest holdings whose |contribution| adds up to ≥ 70% of the total move (4…10 charts) */
const MOVE_SHARE = 0.7, GRID_MIN = 4, GRID_MAX = 10;
const CARD = "oasis-glass border border-white/[0.05] bg-[var(--oasis-panel)]";
const LABEL = "font-mono text-[10px] font-bold tracking-[0.16em] text-zinc-500";

const pp = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(Math.abs(v) < 0.1 ? 3 : 2)} pp`;
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;
const tone = (v: number) => (v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-400");

interface Row extends AttribHolding { r: number | null; c: number | null }

/** One diverging bar row: left half = drag, right half = gain, length ∝ |contribution| */
function DriverRow({ x, max }: { x: Row & { c: number; r: number }; max: number }) {
  const w = Math.min(50, (Math.abs(x.c) / max) * 50);
  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)_52px_64px_minmax(90px,1.2fr)_76px] items-center gap-2 border-b border-white/[0.04] py-[5px] font-mono text-[11px] tabular-nums last:border-b-0"
      title={`${x.tic} · ${x.name}\nweight ${x.w.toFixed(2)}% × return ${pct(x.r)} = ${pp(x.c)}`}>
      <Link href={`/stock/${x.tic}`} className="font-bold text-zinc-100 hover:text-oasis">{x.tic}</Link>
      <span className="truncate font-sans text-[11.5px] text-zinc-500">{x.name}</span>
      <span className="text-right text-zinc-300">{x.w.toFixed(2)}%</span>
      <span className={`text-right ${tone(x.r)}`}>{pct(x.r)}</span>
      <span className="relative h-3 bg-white/[0.03]">
        <span className="absolute inset-y-0 left-1/2 w-px bg-white/[0.15]" />
        <span className={`absolute inset-y-[2px] ${x.c >= 0 ? "left-1/2 bg-emerald-400/70" : "right-1/2 bg-rose-400/70"}`} style={{ width: `${w}%` }} />
      </span>
      <span className={`text-right font-semibold ${tone(x.c)}`}>{pp(x.c)}</span>
    </div>
  );
}

export default function HoldingAttribution({ holdings, etfSym, etfLabel, totalPositions, compact = false }: {
  holdings: AttribHolding[];
  /** Yahoo symbol of the fund itself (for its actual return over the same window) */
  etfSym?: string;
  etfLabel: string;
  /** positions in the real fund (holdings[] may be its top positions only) */
  totalPositions?: number;
  compact?: boolean;
}) {
  const [period, setPeriod] = useState<P>("1M");
  const syms = useMemo(() => [...holdings.map((h) => h.tic), ...(etfSym ? [etfSym] : [])], [holdings, etfSym]);
  const { ret, state } = useHoldingReturns(syms, period);

  const m = useMemo(() => {
    const rows: Row[] = holdings.filter((h) => h.w > 0).map((h) => {
      const r = ret[h.tic.toUpperCase()] ?? null;
      return { ...h, r, c: r == null ? null : (h.w / 100) * r };
    });
    const known = rows.filter((x): x is Row & { c: number; r: number } => x.c != null && x.r != null);
    const missing = rows.filter((x) => x.c == null);
    const sum = known.reduce((t, x) => t + x.c, 0);
    const coveredW = known.reduce((t, x) => t + x.w, 0), listedW = rows.reduce((t, x) => t + x.w, 0);
    const detractors = known.filter((x) => x.c < 0).sort((a, b) => a.c - b.c);
    const contributors = known.filter((x) => x.c > 0).sort((a, b) => b.c - a.c);
    const drag = detractors.reduce((t, x) => t + x.c, 0), lift = contributors.reduce((t, x) => t + x.c, 0);
    const groups = new Map<string, { c: number; w: number; n: number }>();
    for (const x of known) { const g = groups.get(x.group ?? "Other") ?? { c: 0, w: 0, n: 0 }; g.c += x.c; g.w += x.w; g.n++; groups.set(x.group ?? "Other", g); }
    const byGroup = [...groups].map(([g, v]) => ({ g, ...v })).sort((a, b) => a.c - b.c);
    const max = Math.max(0.0001, ...known.map((x) => Math.abs(x.c)));
    // the movers: biggest |contribution| first until they explain ≥ 70% of the gross move
    const gross = known.reduce((t, x) => t + Math.abs(x.c), 0);
    const ranked = [...known].sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
    const movers: typeof known = [];
    let acc = 0;
    for (const x of ranked) {
      if (movers.length >= GRID_MAX || (movers.length >= GRID_MIN && acc >= gross * MOVE_SHARE)) break;
      movers.push(x); acc += Math.abs(x.c);
    }
    const moverShare = gross ? acc / gross : 0;
    return { known, missing, sum, coveredW, listedW, detractors, contributors, drag, lift, byGroup, max, movers, moverShare };
  }, [holdings, ret]);

  const etfRet = etfSym ? ret[etfSym.toUpperCase()] ?? null : null;
  const residual = etfRet != null && m.known.length ? etfRet - m.sum : null;
  const n = compact ? 6 : 8;
  const gmax = Math.max(0.0001, ...m.byGroup.map((g) => Math.abs(g.c)));

  return (
    <section className={`${CARD} flex min-w-0 flex-col gap-3 p-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-bold tracking-[0.16em] text-zinc-200" title="Contribution = weight × return, in percentage points of the fund's return">
          [ PERFORMANCE DRIVERS · {etfLabel} ]
        </span>
        <SegRail items={PERIODS} value={period} onChange={setPeriod} width={PERIODS.length * 42} />
      </div>

      {/* summary: what the fund did vs what the tracked holdings explain */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-y border-white/[0.05] py-2 font-mono text-[11px] tabular-nums md:grid-cols-5">
        {([
          [`${etfLabel} ${period}`, etfRet == null ? (state === "loading" ? "···" : "N/A") : pct(etfRet), etfRet ?? 0, "Actual price return of the fund over the window"],
          ["DRAG (DETRACTORS)", state === "loading" ? "···" : pp(m.drag), m.drag, "Sum of all negative contributions"],
          ["LIFT (CONTRIBUTORS)", state === "loading" ? "···" : pp(m.lift), m.lift, "Sum of all positive contributions"],
          ["Σ TRACKED HOLDINGS", state === "loading" ? "···" : pp(m.sum), m.sum, `Σ weight × return of the ${m.known.length} holdings with price data (${m.coveredW.toFixed(1)}% of the fund)`],
          ["UNEXPLAINED", residual == null ? "—" : pp(residual), 0, "Fund return − Σ contributions: holdings outside the tracked list, cash, fees and weight drift during the window"],
        ] as const).map(([l, v, num, hint]) => (
          <span key={l} className="flex flex-col gap-0.5" title={hint}>
            <span className="cursor-help text-[9px] font-bold tracking-[0.12em] text-zinc-500">{l}</span>
            <span className={`text-[13px] font-semibold ${l === "UNEXPLAINED" ? "text-zinc-300" : tone(num)}`}>{v}</span>
          </span>
        ))}
      </div>

      {state === "error" && <p className="m-0 font-mono text-[10.5px] text-amber-400/80">Some price requests failed — contributions below cover only the holdings that loaded.</p>}

      {/* detractors | contributors */}
      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        {([["TOP DETRACTORS", m.detractors, "dragging the fund down"], ["TOP CONTRIBUTORS", m.contributors, "lifting the fund"]] as const).map(([title, list, sub]) => (
          <div key={title} className="flex min-w-0 flex-col">
            <div className="mb-1 flex items-baseline justify-between">
              <span className={LABEL}>{title}</span>
              <span className="font-mono text-[9.5px] text-zinc-600">{sub}</span>
            </div>
            <div className="grid grid-cols-[56px_minmax(0,1fr)_52px_64px_minmax(90px,1.2fr)_76px] gap-2 border-b border-white/[0.05] pb-1 font-mono text-[9px] font-bold tracking-[0.12em] text-zinc-600">
              <span>TICKER</span><span>NAME</span><span className="text-right">WEIGHT</span><span className="text-right">RETURN</span><span className="text-center">DRAG ◂ ▸ GAIN</span><span className="text-right">CONTRIB.</span>
            </div>
            {state === "loading" ? (
              Array.from({ length: 4 }, (_, i) => <div key={i} className="my-1 h-4 animate-pulse rounded-sm bg-white/[0.03]" />)
            ) : list.length ? (
              list.slice(0, n).map((x) => <DriverRow key={x.tic} x={x} max={m.max} />)
            ) : (
              <p className="m-0 py-2 font-mono text-[10.5px] text-zinc-600">No {title === "TOP DETRACTORS" ? "holding fell" : "holding rose"} over this window.</p>
            )}
            {list.length > n && <span className="pt-1 font-mono text-[9.5px] text-zinc-600">+{list.length - n} more · Σ {pp(list.slice(n).reduce((t, x) => t + x.c, 0))}</span>}
          </div>
        ))}
      </div>

      {/* cumulative by sector — e.g. five aerospace names −10% at 30% weight = −3 pp */}
      {!compact && m.byGroup.length > 1 && state !== "loading" && (
        <div className="flex flex-col gap-1">
          <span className={LABEL}>CUMULATIVE BY SUB-SECTOR</span>
          {m.byGroup.map((g) => (
            <div key={g.g} className="grid grid-cols-[minmax(0,1.2fr)_80px_minmax(90px,1.4fr)_76px] items-center gap-2 font-mono text-[11px] tabular-nums"
              title={`${g.n} holdings · ${g.w.toFixed(1)}% combined weight`}>
              <span className="truncate text-zinc-300">{g.g} <span className="text-zinc-600">· {g.n}</span></span>
              <span className="text-right text-zinc-500">{g.w.toFixed(1)}% wt</span>
              <span className="relative h-3 bg-white/[0.03]">
                <span className="absolute inset-y-0 left-1/2 w-px bg-white/[0.15]" />
                <span className={`absolute inset-y-[2px] ${g.c >= 0 ? "left-1/2 bg-emerald-400/60" : "right-1/2 bg-rose-400/60"}`} style={{ width: `${Math.min(50, (Math.abs(g.c) / gmax) * 50)}%` }} />
              </span>
              <span className={`text-right font-semibold ${tone(g.c)}`}>{pp(g.c)}</span>
            </div>
          ))}
        </div>
      )}

      {/* price charts of the holdings that make the move — same timeline as everything above */}
      {!compact && m.movers.length > 0 && state !== "loading" && (
        <div className="h-[520px] min-h-0">
          <ChartGrid tf={period} onTf={setPeriod} minCell={420}
            title={`WHAT MOVED ${etfLabel} · ${period}`}
            hint={`top ${Math.min(6, m.movers.length)} of ${m.movers.length} holdings = ${(m.moverShare * 100).toFixed(0)}% of the move (gross |contribution|)`}
            items={m.movers.slice(0, 6).map((x) => ({ sym: x.tic, label: x.tic, sub: x.name, href: `/stock/${x.tic}`, note: `${x.w.toFixed(2)}% wt · ${pp(x.c)}` }))} />
        </div>
      )}

      <p className="m-0 font-mono text-[9.5px] leading-relaxed tracking-[0.04em] text-zinc-600">
        CONTRIBUTION = WEIGHT × {PERIOD_LABEL[period].toUpperCase()} PRICE RETURN (CURRENT WEIGHTS) · {m.known.length}/{m.known.length + m.missing.length} HOLDINGS WITH PRICE DATA
        {totalPositions && totalPositions > holdings.length ? ` · TRACKED ${holdings.length} OF ${totalPositions} POSITIONS (${m.listedW.toFixed(1)}% OF THE FUND)` : ""}
        {m.missing.length > 0 && state !== "loading" && <> · N/A (EXCLUDED, NOT ZERO): {m.missing.slice(0, 8).map((x) => x.tic).join(", ")}{m.missing.length > 8 ? " …" : ""}</>}
      </p>
    </section>
  );
}
