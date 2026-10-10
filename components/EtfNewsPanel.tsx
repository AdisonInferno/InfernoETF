"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/* News for one ETF from the archive: COMPANY (its holdings) · SECTOR (its industries) · MACRO. */

type Kind = "company" | "sector" | "macro";
interface Item {
  id: string; ts: number; headline: string; summary: string; source: string; url: string;
  holdings: { tic: string; w: number }[];
  sectors: { sub: string; pct: number }[];
  score: number;
}
interface Data {
  tic: string; name: string; days: number;
  company: Item[]; sector: Item[]; macro: Item[];
  coverage: number;
  topSectors: { sub: string; pct: number; articles: number }[];
}

const ago = (ts: number) => {
  const s = Date.now() / 1000 - ts;
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
};
const TAB_LABEL: Record<Kind, string> = { company: "COMPANY", sector: "SECTOR", macro: "MACRO" };
const TAB_HINT: Record<Kind, string> = {
  company: "News about companies held by this ETF, tagged with their weight in it.",
  sector: "Industry news (and peers it doesn't hold) in sectors this ETF is exposed to.",
  macro: "Rates, inflation and broad-market news — affects every ETF.",
};

export default function EtfNewsPanel({ ticker }: { ticker: string }) {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<Kind>("company");
  const [state, setState] = useState<{ key: string; data: Data | null; error?: string }>({ key: "", data: null });
  const key = `${ticker}:${days}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/news-archive/etf/${encodeURIComponent(ticker)}?days=${days}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error ?? r.statusText))))
      .then((d: Data) => { if (!cancelled) setState({ key, data: d }); })
      .catch((e: Error) => { if (!cancelled) setState({ key, data: null, error: e.message }); });
    return () => { cancelled = true; };
  }, [ticker, days, key]);

  const loading = state.key !== key;
  const d = loading ? null : state.data;
  const items = d ? d[tab] : [];
  const empty = d && d.company.length + d.sector.length + d.macro.length === 0;

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.05] bg-[#0a0a0c] font-mono">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.05] px-4 py-3">
        <span className="text-[11px] font-bold tracking-[0.18em] text-neutral-200">{ticker} · NEWS</span>
        <div className="flex rounded-lg border border-white/[0.05] bg-[#030303] p-0.5">
          {(["company", "sector", "macro"] as Kind[]).map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)} title={TAB_HINT[k]} className={`h-7 rounded-md px-2.5 text-[10.5px] font-bold tracking-[0.08em] ${tab === k ? "bg-white/[0.08] text-white" : "text-zinc-500 hover:text-zinc-200"}`}>
              {TAB_LABEL[k]} <span className="font-normal text-zinc-500">{d ? d[k].length : "·"}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex rounded-lg border border-white/[0.05] bg-[#030303] p-0.5">
          {[7, 30, 90, 365].map((n) => (
            <button key={n} type="button" onClick={() => setDays(n)} className={`h-7 min-w-10 rounded-md px-2 text-[10.5px] font-bold ${days === n ? "bg-white/[0.08] text-emerald-400" : "text-zinc-500 hover:text-zinc-200"}`}>
              {n}D
            </button>
          ))}
        </div>
      </div>

      {/* What drives this ETF's news */}
      {d && !empty && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/[0.05] bg-[#030303]/40 px-4 py-2.5 text-[10.5px]">
          <span className="text-zinc-500" title="Share of the ETF's weight whose holdings had at least one article in this window">
            COVERAGE <span className={`font-bold ${d.coverage >= 40 ? "text-emerald-400" : d.coverage >= 15 ? "text-amber-400" : "text-rose-400"}`}>{d.coverage.toFixed(0)}%</span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-zinc-500">
            SECTORS
            {d.topSectors.map((s) => (
              <span key={s.sub} className="rounded border border-white/[0.06] px-1.5 py-0.5 text-zinc-300">
                {s.sub} <span className="text-zinc-500">{s.pct.toFixed(0)}%</span> · <span className="text-purple-300">{s.articles}</span>
              </span>
            ))}
          </span>
        </div>
      )}

      {/* List */}
      <ul className="m-0 max-h-[640px] list-none overflow-auto p-0 [scrollbar-width:thin]" aria-busy={loading}>
        {loading && [0, 1, 2, 3].map((i) => (
          <li key={i} className="flex flex-col gap-2 border-b border-white/[0.04] px-4 py-3">
            <div className="h-3 w-3/4 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-white/[0.04]" />
          </li>
        ))}
        {!loading && state.error && <li className="p-6 text-[11px] text-rose-400">⚠ {state.error}</li>}
        {!loading && empty && (
          <li className="flex flex-col items-center gap-2 p-8 text-center text-[11px] text-zinc-500">
            No archived news for {ticker} in the last {days} days.
            <Link href="/news/archive" className="font-bold tracking-[0.1em] text-emerald-400 hover:text-emerald-300">[ OPEN NEWS ARCHIVE → COLLECT / BACKFILL ]</Link>
          </li>
        )}
        {!loading && d && !empty && items.length === 0 && <li className="p-8 text-center text-[11px] tracking-[0.12em] text-zinc-600">NO {TAB_LABEL[tab]} NEWS IN {days}D</li>}
        {!loading && items.map((a) => (
          <li key={a.id} className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 border-b border-white/[0.04] px-4 py-2.5 last:border-b-0">
            <span className="pt-0.5 text-[10.5px] text-zinc-600" title={new Date(a.ts * 1000).toLocaleString("pl-PL")}>{ago(a.ts)}</span>
            <div className="min-w-0">
              <a href={a.url || undefined} target="_blank" rel="noreferrer" className="font-sans text-[13px] text-zinc-100 hover:text-white hover:underline">{a.headline}</a>
              {a.summary && <p className="m-0 mt-1 line-clamp-2 font-sans text-[12px] leading-snug text-zinc-400">{a.summary}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                <span className="text-zinc-500">{a.source}</span>
                {a.holdings.map((h) => (
                  <span key={h.tic} className="font-bold text-emerald-400" title={`${h.w}% of ${ticker}`}>{h.tic} <span className="font-normal text-emerald-400/60">{h.w.toFixed(1)}%</span></span>
                ))}
                {a.sectors.slice(0, 2).map((s) => (
                  <span key={s.sub} className="text-purple-300" title={`${ticker} exposure to ${s.sub}: ${s.pct}%`}>{s.sub} <span className="text-purple-300/60">{s.pct.toFixed(0)}%</span></span>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
