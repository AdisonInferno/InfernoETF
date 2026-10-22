"use client";

/* EARNINGS on the NEWS page
   · REPORTED (last 14 days): biggest market impact first — top 3 as large cards with the stock's
     price reaction to the release, the rest compact
   · UPCOMING (next 21 days): by date, estimates only ("EXPECTED")
   Every row names the company AND its sector. Click → earnings deep dive:
     KEY FACTS  (what the results / press release say, as text)
     FINANCIALS (actual vs estimate with ▲ beat / ▼ miss arrows, last quarters) */

import { useEffect, useState } from "react";

interface Row {
  ticker: string; name: string; sector: string; subSector: string | null;
  date: string; hour: string; quarter: number | null; year: number | null;
  epsActual: number | null; epsEstimate: number | null; revActual: number | null; revEstimate: number | null;
  reported: boolean; reaction: number | null; impact: number; capB: number; etfs: string[];
}
interface Quarter { end: string; label: string; revenue: number | null; netIncome: number | null; eps: number | null; grossProfit: number | null; operatingIncome: number | null }
interface Hist { period: string; quarter?: number; year?: number; actual: number | null; estimate: number | null; surprisePct: number | null }
interface Detail {
  ticker: string; name: string; sector: string | null; industry: string | null; currency: string;
  price: number | null; marketCap: number | null; pe: number | null; forwardPe: number | null;
  quarters: Quarter[]; earnings: Hist[];
  release: { url: string; at: string; description: string } | null;
  read: { direction: "up" | "down" | "neutral"; headline: string; detail: string; basis: string } | null;
  error?: string;
}

const MONO = "font-mono";
const big = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  return a >= 1e12 ? `${s}$${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : `${s}$${a.toFixed(0)}`;
};
const eps = (v: number | null | undefined) => (v == null ? "—" : `$${v.toFixed(2)}`);
const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
const when = (r: Row) => {
  const d = Math.round((Date.parse(r.date + "T12:00:00Z") - Date.now()) / 864e5);
  const h = r.hour === "bmo" ? " · BEFORE OPEN" : r.hour === "amc" ? " · AFTER CLOSE" : "";
  const label = new Date(r.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
  return `${label}${h}${d > 0 ? ` · IN ${d}D` : d === 0 ? " · TODAY" : ""}`;
};

/** ▲ beat / ▼ miss / ● in line vs estimate (green / red / grey) */
function Beat({ a, e, money }: { a: number | null; e: number | null; money?: boolean }) {
  if (a == null && e != null) return <span className="text-zinc-500">EXPECTED {money ? big(e) : eps(e)}</span>;
  if (a == null) return <span className="text-zinc-600">—</span>;
  if (e == null || e === 0) return <span className="text-zinc-200">{money ? big(a) : eps(a)}</span>;
  const s = (a / Math.abs(e) - Math.sign(e)) * 100;
  const cls = s > 0.5 ? "text-emerald-400" : s < -0.5 ? "text-rose-400" : "text-zinc-400";
  return (
    <span className={`${cls} tabular-nums`} title={`Actual ${money ? big(a) : eps(a)} vs estimate ${money ? big(e) : eps(e)}`}>
      {s > 0.5 ? "▲" : s < -0.5 ? "▼" : "●"} {money ? big(a) : eps(a)} <span className="text-zinc-500">vs {money ? big(e) : eps(e)}</span> <span className="font-bold">{pct(s)}</span>
    </span>
  );
}

/** How the stock reacted to the release */
function Reaction({ v, large }: { v: number | null; large?: boolean }) {
  if (v == null) return <span className={`${MONO} rounded-sm bg-white/[0.04] px-2 py-1 text-[10px] tracking-[0.1em] text-zinc-500`}>REACTION PENDING</span>;
  const up = v >= 0;
  return (
    <span title="Stock price move on the results: last close before the release → first close after it"
      className={`${MONO} flex flex-col items-end rounded-sm px-2.5 py-1 font-bold ${up ? "bg-emerald-500/12 text-emerald-300" : "bg-rose-500/12 text-rose-300"}`}>
      <span className={large ? "text-[20px] leading-none" : "text-[13px]"}>{up ? "▲" : "▼"} {pct(v)}</span>
      <span className="text-[8.5px] tracking-[0.14em] opacity-70">STOCK REACTION</span>
    </span>
  );
}

const Who = ({ r }: { r: Row }) => (
  <span className="flex min-w-0 items-center gap-2">
    <span className={`${MONO} flex-none rounded-sm bg-sky-400/10 px-2 py-0.5 text-[12px] font-bold text-sky-300`}>{r.ticker}</span>
    <span className="truncate text-[13.5px] font-semibold text-zinc-100">{r.name}</span>
    <span className={`${MONO} flex-none rounded-sm border border-white/[0.08] px-1.5 py-px text-[9.5px] tracking-[0.08em] text-zinc-400`} title={r.subSector ?? undefined}>{r.sector.toUpperCase()}</span>
  </span>
);

function TopCard({ r, rank, onOpen }: { r: Row; rank: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex min-w-0 flex-col gap-2.5 rounded-sm border border-white/[0.08] bg-[var(--oasis-bg)] p-3.5 text-left transition-colors hover:border-oasis/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={`${MONO} text-[9.5px] tracking-[0.16em] text-zinc-500`}>#{rank} · {when(r)}</span>
          <Who r={r} />
        </div>
        <Reaction v={r.reaction} large />
      </div>
      <div className={`${MONO} flex flex-col gap-1 text-[11.5px]`}>
        <span className="flex gap-2"><span className="w-[34px] text-zinc-500">EPS</span><Beat a={r.epsActual} e={r.epsEstimate} /></span>
        <span className="flex gap-2"><span className="w-[34px] text-zinc-500">REV</span><Beat a={r.revActual} e={r.revEstimate} money /></span>
      </div>
      <span className={`${MONO} text-[9.5px] tracking-[0.1em] text-zinc-600`}>CAP {big(r.capB * 1e9)} · MOVES {r.etfs.join(" ")} · CLICK = DEEP DIVE</span>
    </button>
  );
}

function Line({ r, onOpen }: { r: Row; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="grid min-w-0 grid-cols-1 items-center gap-2 border-b border-white/[0.04] px-2 py-2 text-left hover:bg-white/[0.03] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
      <span className="flex min-w-0 flex-col gap-0.5">
        <Who r={r} />
        <span className={`${MONO} text-[9.5px] tracking-[0.1em] text-zinc-500`}>{when(r)}</span>
      </span>
      <span className={`${MONO} flex flex-col gap-0.5 text-[11px]`}>
        <span className="flex gap-2"><span className="w-[30px] text-zinc-500">EPS</span><Beat a={r.epsActual} e={r.epsEstimate} /></span>
        <span className="flex gap-2"><span className="w-[30px] text-zinc-500">REV</span><Beat a={r.revActual} e={r.revEstimate} money /></span>
      </span>
      {r.reported ? <Reaction v={r.reaction} /> : <span className={`${MONO} rounded-sm border border-white/[0.08] px-2 py-1 text-[10px] tracking-[0.12em] text-zinc-400`}>EXPECTED</span>}
    </button>
  );
}

function DeepDive({ r, onClose }: { r: Row; onClose: () => void }) {
  const [tab, setTab] = useState<"FACTS" | "FIN">("FACTS");
  const [d, setD] = useState<Detail | null>(null);
  useEffect(() => {
    let off = false;
    fetch(`/api/intel/earnings/${encodeURIComponent(r.ticker)}`).then((x) => x.json()).then((j: Detail) => { if (!off) setD(j); }).catch(() => { if (!off) setD({ error: "unavailable" } as Detail); });
    return () => { off = true; };
  }, [r.ticker]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const q = d?.quarters ?? [];
  const last = q[q.length - 1], yearAgo = q.length >= 5 ? q[q.length - 5] : null;
  const yoy = last?.revenue && yearAgo?.revenue ? (last.revenue / yearAgo.revenue - 1) * 100 : null;
  const margin = last?.revenue && last.netIncome != null ? (last.netIncome / last.revenue) * 100 : null;
  const hist = (d?.earnings ?? []).filter((h) => h.actual != null && h.estimate != null);
  const beats = hist.slice(0, 4).filter((h) => h.actual! > h.estimate!).length;
  const s = (a: number | null, e: number | null) => (a != null && e ? (a / Math.abs(e) - Math.sign(e)) * 100 : null);
  const epsS = s(r.epsActual, r.epsEstimate), revS = s(r.revActual, r.revEstimate);

  const facts: string[] = [];
  if (r.reported) {
    if (epsS != null) facts.push(`EPS ${eps(r.epsActual)} vs ${eps(r.epsEstimate)} expected — ${epsS >= 0 ? "beat" : "missed"} by ${Math.abs(epsS).toFixed(1)}%.`);
    if (revS != null) facts.push(`Revenue ${big(r.revActual)} vs ${big(r.revEstimate)} expected — ${revS >= 0 ? "beat" : "missed"} by ${Math.abs(revS).toFixed(1)}%.`);
    if (r.reaction != null) facts.push(`The stock ${r.reaction >= 0 ? "rose" : "fell"} ${Math.abs(r.reaction).toFixed(1)}% on the results.`);
  } else {
    facts.push(`Results expected ${when(r).toLowerCase()}.`);
    if (r.epsEstimate != null) facts.push(`Analysts expect EPS of ${eps(r.epsEstimate)}${r.revEstimate != null ? ` on revenue of ${big(r.revEstimate)}` : ""}.`);
  }
  if (yoy != null) facts.push(`Last reported quarter (${last!.label}): revenue ${big(last!.revenue)}, ${yoy >= 0 ? "up" : "down"} ${Math.abs(yoy).toFixed(1)}% year on year.`);
  if (margin != null) facts.push(`Net margin last quarter: ${margin.toFixed(1)}%.`);
  if (hist.length >= 2) facts.push(`Beat the EPS estimate in ${beats} of the last ${Math.min(4, hist.length)} quarters.`);
  if (d?.pe) facts.push(`Valuation: P/E ${d.pe.toFixed(1)}${d.forwardPe ? ` · forward P/E ${d.forwardPe.toFixed(1)}` : ""}.`);

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[8vh]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-[860px] flex-col gap-3 rounded-sm border border-white/[0.1] bg-[var(--oasis-panel)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={`${MONO} text-[10px] tracking-[0.16em] text-zinc-500`}>[ EARNINGS DEEP DIVE ] · {r.quarter && r.year ? `Q${r.quarter} ${r.year} · ` : ""}{when(r)}</span>
            <Who r={r} />
          </div>
          <div className="flex items-start gap-3">
            {r.reported ? <Reaction v={r.reaction} large /> : <span className={`${MONO} rounded-sm border border-white/[0.1] px-2.5 py-1.5 text-[11px] font-bold tracking-[0.12em] text-zinc-300`}>EXPECTED</span>}
            <button type="button" onClick={onClose} aria-label="Close" className="text-[18px] leading-none text-zinc-500 hover:text-white">×</button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-white/[0.06]">
          {([["FACTS", "KEY FACTS"], ["FIN", "FINANCIAL RESULTS"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`${MONO} -mb-px border-b-2 px-3 py-2 text-[11px] font-bold tracking-[0.14em] ${tab === k ? "border-oasis text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}>{l}</button>
          ))}
        </div>

        {tab === "FACTS" ? (
          <div className="flex flex-col gap-3">
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {facts.map((f) => <li key={f} className="flex gap-2 text-[13.5px] leading-snug text-zinc-200"><span className="text-oasis">›</span>{f}</li>)}
            </ul>
            {!d && <div className="h-16 animate-pulse rounded-sm bg-white/[0.03]" />}
            {d?.read && d.read.basis !== "none" && (
              <div className="flex flex-col gap-1 rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] p-3">
                <span className={`${MONO} text-[9.5px] tracking-[0.16em] text-zinc-500`}>FROM THE RESULTS RELEASE{d.read.basis === "ai" ? " · AI READ — VERIFY IN FILING" : ""}</span>
                <span className={`text-[13.5px] font-semibold ${d.read.direction === "up" ? "text-emerald-300" : d.read.direction === "down" ? "text-rose-300" : "text-zinc-200"}`}>{d.read.headline}</span>
                <span className="text-[12.5px] leading-snug text-zinc-400">{d.read.detail}</span>
              </div>
            )}
            {d?.release && <a href={d.release.url} target="_blank" rel="noreferrer" className={`${MONO} text-[10.5px] tracking-[0.1em] text-zinc-400 hover:text-white`}>[ OPEN SEC FILING · {d.release.description} → ]</a>}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <table className={`${MONO} w-full text-[12px]`}>
              <thead><tr className="text-left text-[9.5px] tracking-[0.14em] text-zinc-500"><th className="pb-1.5">THIS REPORT</th><th className="pb-1.5">ACTUAL vs ESTIMATE</th></tr></thead>
              <tbody>
                <tr className="border-t border-white/[0.05]"><td className="py-1.5 text-zinc-400">EPS</td><td><Beat a={r.epsActual} e={r.epsEstimate} /></td></tr>
                <tr className="border-t border-white/[0.05]"><td className="py-1.5 text-zinc-400">REVENUE</td><td><Beat a={r.revActual} e={r.revEstimate} money /></td></tr>
              </tbody>
            </table>
            {hist.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className={`${MONO} text-[9.5px] tracking-[0.16em] text-zinc-500`}>EPS · LAST QUARTERS (▲ BEAT · ▼ MISS)</span>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {hist.slice(0, 8).map((h) => (
                    <div key={h.period} className="rounded-sm border border-white/[0.05] bg-[var(--oasis-bg)] px-2.5 py-1.5">
                      <div className={`${MONO} text-[9.5px] text-zinc-500`}>{h.quarter && h.year ? `Q${h.quarter} ${h.year}` : h.period}</div>
                      <div className={`${MONO} text-[11.5px]`}><Beat a={h.actual} e={h.estimate} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {q.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className={`${MONO} text-[9.5px] tracking-[0.16em] text-zinc-500`}>QUARTERLY RESULTS · SEC FILINGS ({d?.currency ?? "USD"})</span>
                <table className={`${MONO} w-full text-[11.5px] tabular-nums`}>
                  <thead><tr className="text-right text-[9.5px] tracking-[0.12em] text-zinc-500"><th className="text-left">QUARTER</th><th>REVENUE</th><th>NET INCOME</th><th>NET MARGIN</th><th>EPS</th></tr></thead>
                  <tbody>
                    {[...q].reverse().map((x, i, arr) => {
                      const prev = arr[i + 1];
                      const up = x.revenue != null && prev?.revenue != null ? x.revenue >= prev.revenue : null;
                      return (
                        <tr key={x.end} className="border-t border-white/[0.04] text-right text-zinc-200">
                          <td className="py-1 text-left text-zinc-400">{x.label}</td>
                          <td>{up == null ? "" : <span className={up ? "text-emerald-400" : "text-rose-400"}>{up ? "▲ " : "▼ "}</span>}{big(x.revenue)}</td>
                          <td className={x.netIncome != null && x.netIncome < 0 ? "text-rose-400" : ""}>{big(x.netIncome)}</td>
                          <td>{x.revenue && x.netIncome != null ? `${((x.netIncome / x.revenue) * 100).toFixed(1)}%` : "—"}</td>
                          <td>{eps(x.eps)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {d && !q.length && !hist.length && <p className="m-0 text-[11.5px] text-zinc-500">No detailed financials available for {r.ticker}.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EarningsPanel() {
  const [st, setSt] = useState<{ reported: Row[]; upcoming: Row[]; error?: string } | null>(null);
  const [open, setOpen] = useState<Row | null>(null);
  const [moreRep, setMoreRep] = useState(false);
  const [moreUp, setMoreUp] = useState(false);
  useEffect(() => {
    let off = false;
    fetch("/api/intel/earnings?back=14&fwd=21", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (!off) setSt({ reported: j.reported ?? [], upcoming: j.upcoming ?? [], error: j.error }); })
      .catch(() => { if (!off) setSt({ reported: [], upcoming: [], error: "unavailable" }); });
    return () => { off = true; };
  }, []);

  const top = st?.reported.slice(0, 3) ?? [];
  const rest = st?.reported.slice(3, moreRep ? 20 : 7) ?? [];
  const up = st?.upcoming.slice(0, moreUp ? 30 : 8) ?? [];
  const lbl = `${MONO} text-[10px] font-bold tracking-[0.16em] text-zinc-500`;

  return (
    <div className="flex flex-col gap-4">
      {!st && <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-[150px] animate-pulse rounded-sm bg-white/[0.03]" />)}</div>}
      {st?.error && <p className="m-0 text-[11px] text-amber-400">⚠ Earnings data: {st.error}</p>}
      {st && (
        <>
          <div className="flex flex-col gap-2">
            <span className={lbl}>REPORTED · LAST 14 DAYS · BIGGEST MARKET IMPACT FIRST</span>
            {top.length ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">{top.map((r, i) => <TopCard key={r.ticker + r.date} r={r} rank={i + 1} onOpen={() => setOpen(r)} />)}</div>
            ) : <p className="m-0 text-[11.5px] text-zinc-600">No tracked company reported in the last 14 days.</p>}
            {rest.length > 0 && <div className="flex flex-col">{rest.map((r) => <Line key={r.ticker + r.date} r={r} onOpen={() => setOpen(r)} />)}</div>}
            {st.reported.length > 7 && <button type="button" onClick={() => setMoreRep((v) => !v)} className={`${MONO} self-start text-[10.5px] tracking-[0.12em] text-zinc-500 hover:text-white`}>{moreRep ? "[ SHOW LESS ]" : `[ + ${Math.min(20, st.reported.length) - 7} MORE REPORTED ]`}</button>}
          </div>
          <div className="flex flex-col gap-2">
            <span className={lbl}>UPCOMING · NEXT 21 DAYS · ESTIMATES</span>
            <div className="flex flex-col">{up.map((r) => <Line key={r.ticker + r.date} r={r} onOpen={() => setOpen(r)} />)}</div>
            {!up.length && <p className="m-0 text-[11.5px] text-zinc-600">No tracked earnings scheduled.</p>}
            {st.upcoming.length > 8 && <button type="button" onClick={() => setMoreUp((v) => !v)} className={`${MONO} self-start text-[10.5px] tracking-[0.12em] text-zinc-500 hover:text-white`}>{moreUp ? "[ SHOW LESS ]" : `[ + ${Math.min(30, st.upcoming.length) - 8} MORE UPCOMING ]`}</button>}
          </div>
        </>
      )}
      {open && <DeepDive r={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
