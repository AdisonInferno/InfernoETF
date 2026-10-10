"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* Archive control room: how much history we have, the background jobs, and a search over it. */

interface Article { id: string; provider: string; ts: number; headline: string; summary: string; source: string; url: string; tickers: string[] }
interface Job { kind: string | null; running: boolean; done: number; total: number; added: number; errors: number; log: string[]; lastCollectAt: number | null; nextCollectAt: number | null }
interface Payload {
  stats: { total: number; oldest: number | null; newest: number | null; bytes: number; perProvider: Record<string, number>; perMonth: [string, number][]; topTickers: [string, number][] };
  job: Job;
  finnhub: boolean;
  universe: string[];
  articles: Article[];
}

const label = "font-mono text-[10px] font-bold tracking-[0.16em] text-zinc-500";
const card = "rounded-2xl border border-white/[0.05] bg-[#0a0a0c]";
const fmtDate = (ts: number | null) => (ts ? new Date(ts * 1000).toISOString().slice(0, 10) : "—");
const fmtTime = (ts: number | null) => (ts ? new Date(ts * 1000).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : "—");
const ago = (ts: number) => {
  const s = Date.now() / 1000 - ts;
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
};

export default function NewsArchivePanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [ticker, setTicker] = useState("");
  const [q, setQ] = useState("");
  const [days, setDays] = useState(365);
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ limit: "60" });
    if (ticker) p.set("ticker", ticker);
    if (q) p.set("q", q);
    const res = await fetch(`/api/news-archive?${p}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, [ticker, q]);

  // Initial load + refresh on filter change (debounced); poll every 2 s while a job runs.
  useEffect(() => {
    const id = setTimeout(() => { void load(); }, 250);
    return () => clearTimeout(id);
  }, [load]);
  useEffect(() => {
    if (!data?.job.running) return;
    timer.current = setTimeout(() => { void load(); }, 2000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [data, load]);

  const post = async (url: string, body?: object) => {
    setMsg(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) setMsg(j.reason ?? j.error ?? `Error ${res.status}`);
    void load();
  };

  const s = data?.stats, job = data?.job;
  const maxMonth = Math.max(1, ...(s?.perMonth ?? []).map(([, n]) => n));
  const spanDays = s?.oldest && s.newest ? Math.round((s.newest - s.oldest) / 86400) : 0;

  return (
    <div className="flex flex-col gap-4 font-mono tabular-nums">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["ARTICLES", s ? s.total.toLocaleString("en-US") : "—"],
          ["HISTORY", s?.oldest ? `${spanDays} D` : "—"],
          ["OLDEST", fmtDate(s?.oldest ?? null)],
          ["NEWEST", fmtDate(s?.newest ?? null)],
          ["ON DISK", s ? `${(s.bytes / 1024 / 1024).toFixed(2)} MB` : "—"],
        ].map(([k, v]) => (
          <div key={k} className={`${card} px-4 py-3`}>
            <div className={label}>{k}</div>
            <div className="mt-1 text-[20px] font-semibold text-neutral-50">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Coverage by month */}
        <section className={`${card} flex flex-col gap-3 p-4`}>
          <div className="flex items-center justify-between">
            <span className={`${label} text-zinc-300`}>COVERAGE BY MONTH</span>
            <span className="text-[10px] text-zinc-600">{Object.entries(s?.perProvider ?? {}).map(([p, n]) => `${p.toUpperCase()} ${n}`).join(" · ")}</span>
          </div>
          {s && s.perMonth.length ? (
            <div className="flex h-40 items-end gap-1">
              {s.perMonth.map(([m, n]) => (
                <div key={m} className="group flex min-w-0 flex-1 flex-col items-center gap-1" title={`${m}: ${n}`}>
                  <span className="text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100">{n}</span>
                  <div className="w-full rounded-t-sm bg-emerald-400/70 group-hover:bg-emerald-300" style={{ height: `${(n / maxMonth) * 120}px` }} />
                  <span className="text-[8.5px] text-zinc-600">{m.slice(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[12px] text-zinc-500">Archive is empty. Run COLLECT NOW, then BACKFILL to pull up to a year of history.</p>
          )}
        </section>

        {/* Jobs */}
        <section className={`${card} flex flex-col gap-3 p-4`}>
          <div className="flex items-center justify-between">
            <span className={`${label} text-zinc-300`}>COLLECTOR</span>
            <span className={`text-[10px] font-bold tracking-[0.12em] ${data?.finnhub ? "text-emerald-400" : "text-amber-400"}`}>
              FINNHUB {data?.finnhub ? "CONNECTED" : "NO KEY"}
            </span>
          </div>
          <div className="text-[11px] text-zinc-400">
            LAST RUN <span className="text-zinc-100">{fmtTime(job?.lastCollectAt ?? null)}</span> · NEXT <span className="text-zinc-100">{fmtTime(job?.nextCollectAt ?? null)}</span> · {data?.universe.length ?? 0} TICKERS
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={job?.running} onClick={() => post("/api/news-archive/collect")} className="h-8 border border-emerald-400 px-3 text-[10.5px] font-bold tracking-[0.12em] text-emerald-400 hover:bg-emerald-400 hover:text-black disabled:pointer-events-none disabled:opacity-40">
              [ COLLECT NOW ]
            </button>
            <span className="flex items-center gap-1">
              <button type="button" disabled={job?.running || !data?.finnhub} onClick={() => post("/api/news-archive/backfill", { days })} className="h-8 border border-purple-400/70 px-3 text-[10.5px] font-bold tracking-[0.12em] text-purple-300 hover:bg-purple-400 hover:text-black disabled:pointer-events-none disabled:opacity-40">
                [ BACKFILL ]
              </button>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-md border border-white/[0.06] bg-[#030303] px-2 text-[10.5px] text-zinc-300">
                {[30, 90, 180, 365].map((d) => <option key={d} value={d}>{d} D</option>)}
              </select>
            </span>
          </div>
          {msg && <p className="m-0 text-[11px] text-amber-400">⚠ {msg}</p>}
          {job?.running && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] text-zinc-400">
                <span>{job.kind?.toUpperCase()} · {job.done}/{job.total}</span>
                <span className="text-emerald-400">+{job.added}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full bg-emerald-400 transition-[width]" style={{ width: `${job.total ? (job.done / job.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}
          <pre className="m-0 h-28 overflow-auto rounded-lg border border-white/[0.05] bg-black/40 p-2 text-[10px] leading-relaxed text-zinc-500">
            {(job?.log ?? []).slice().reverse().join("\n") || "—"}
          </pre>
        </section>
      </div>

      {/* Browse */}
      <section className={`${card} flex flex-col`}>
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.05] px-4 py-3">
          <span className={`${label} mr-2 text-zinc-300`}>BROWSE</span>
          <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="TICKER" className="h-8 w-28 rounded-md border border-white/[0.06] bg-[#030303] px-2.5 text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search headlines…" className="h-8 min-w-0 flex-1 rounded-md border border-white/[0.06] bg-[#030303] px-2.5 text-[11.5px] text-zinc-100 outline-none focus:border-zinc-600" />
          <div className="hidden flex-wrap gap-1 lg:flex">
            {(s?.topTickers ?? []).slice(0, 8).map(([t, n]) => (
              <button key={t} type="button" onClick={() => setTicker(ticker === t ? "" : t)} className={`h-7 rounded-md px-2 text-[10.5px] font-bold ${ticker === t ? "bg-white/[0.1] text-white" : "text-zinc-500 hover:text-zinc-200"}`}>
                {t} <span className="font-normal text-zinc-600">{n}</span>
              </button>
            ))}
          </div>
        </div>
        <ul className="m-0 max-h-[560px] list-none overflow-auto p-0 [scrollbar-width:thin]">
          {(data?.articles ?? []).map((a) => (
            <li key={a.id} className="grid grid-cols-[52px_minmax(0,1fr)] gap-3 border-b border-white/[0.04] px-4 py-2.5 last:border-b-0">
              <span className="pt-0.5 text-[10.5px] text-zinc-600" title={new Date(a.ts * 1000).toLocaleString("pl-PL")}>{ago(a.ts)}</span>
              <div className="min-w-0">
                <a href={a.url || undefined} target="_blank" rel="noreferrer" className="font-sans text-[13px] text-zinc-100 hover:text-white hover:underline">{a.headline}</a>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-zinc-500">
                  <span>{a.source}</span>
                  <span className="text-zinc-700">{a.provider.toUpperCase()}</span>
                  {a.tickers.slice(0, 6).map((t) => <span key={t} className="text-zinc-400">{t}</span>)}
                </div>
              </div>
            </li>
          ))}
          {data && data.articles.length === 0 && <li className="p-8 text-center text-[11px] tracking-[0.14em] text-zinc-600">NO ARTICLES</li>}
        </ul>
      </section>
    </div>
  );
}
