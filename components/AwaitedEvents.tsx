"use client";

import { useEffect, useState } from "react";

/* "What is the market waiting for?" — upcoming events ranked by expected market impact (v1 scoring,
   see lib/intel/awaited.ts). Sits next to the event calendar on the NEWS page. */

interface A { source: string; code: string; at: string; title: string; allDay?: boolean; score: number; weight: number; why: string; etfs?: string[] }

const CHIP: Record<string, string> = { EARN: "bg-red-500/15 text-red-300", FED: "bg-amber-400/15 text-amber-300", FRED: "bg-sky-400/15 text-sky-300", MKT: "bg-violet-400/15 text-violet-300" };

function inDays(at: string) {
  const d = Math.round((Date.parse(at) - Date.now()) / 86400_000);
  return d <= 0 ? "TODAY" : d === 1 ? "TOMORROW" : `IN ${d}D`;
}

function Bars({ n }: { n: number }) {
  return (
    <span className="flex items-end gap-[2px]" aria-label={`impact ${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={`w-[3px] ${i <= n ? "bg-red-400" : "bg-white/[0.08]"}`} style={{ height: 4 + i * 2 }} />)}
    </span>
  );
}

export default function AwaitedEvents() {
  const [d, setD] = useState<{ events: A[]; missing: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/intel/awaited?days=21", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { if (!off) setD(j); })
      .catch((e: Error) => { if (!off) setErr(e.message); });
    return () => { off = true; };
  }, []);

  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-sm border border-white/[0.06] bg-[var(--oasis-panel)] p-4 font-mono">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-[12px] font-bold tracking-[0.16em] text-zinc-200">[ MARKET IS WAITING FOR ]</h2>
        <span className="text-[9.5px] tracking-[0.12em] text-zinc-600">NEXT 21D · BY IMPACT</span>
      </div>
      {!d && !err && [0, 1, 2, 3].map((i) => <div key={i} className="h-9 animate-pulse rounded-sm bg-white/[0.03]" />)}
      {err && <p className="m-0 text-[11px] text-amber-400">⚠ {err}</p>}
      {d?.events.map((e, i) => (
        <div key={e.source + e.code + e.at} className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 border-b border-white/[0.04] pb-1.5 last:border-b-0">
          <span className="row-span-2 self-start pt-0.5 text-[10px] text-zinc-600">{i + 1}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className={`flex-none rounded-sm px-1.5 py-0.5 text-[10.5px] font-bold ${CHIP[e.source] ?? "bg-white/[0.06] text-zinc-300"}`}>{e.code}</span>
            <span className="truncate font-sans text-[12px] text-zinc-300">{e.source === "EARN" ? "earnings" : e.title}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="text-[10px] tracking-[0.06em] text-zinc-500">{inDays(e.at)}</span>
            <Bars n={e.weight} />
          </span>
          <span className="col-span-2 truncate text-[10px] text-zinc-500">
            {e.why}{e.etfs?.length ? <span className="text-zinc-400"> · moves {e.etfs.join(" ")}</span> : null}
          </span>
        </div>
      ))}
      {d && d.events.length === 0 && <p className="m-0 text-[11px] text-zinc-600">No scheduled events in the next 21 days{d.missing.length ? ` — add ${d.missing.join(" + ")} to .env.local` : ""}.</p>}
      <p className="m-0 border-t border-white/[0.06] pt-1.5 text-[9px] leading-relaxed tracking-[0.04em] text-zinc-600">
        IMPACT v1 · earnings: market cap + S&P weight + ETF reach · macro: historical S&P sensitivity. Options-implied moves coming later.
      </p>
    </section>
  );
}
