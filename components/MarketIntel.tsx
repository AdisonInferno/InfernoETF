"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/* Market Intel: sector sentiment map · latest SEC filings · macro & earnings calendar. */

type Region = "us" | "eu" | "asia";
interface Sector { id: string; label: string; index: number; articles: number; driver: { headline: string; url: string; source: string } | null }
interface Filing { ticker: string; company: string; form: string; acceptedAt: string; description: string; url: string; cik: number; accession: string; doc: string; items: string }
interface Insight { direction: "up" | "down" | "neutral"; headline: string; detail: string; basis: "form4" | "xbrl" | "rules" | "ai" | "none" }

const ARROW: Record<Insight["direction"], { icon: string; chip: string; text: string; word: string }> = {
  up: { icon: "▲", chip: "bg-emerald-400/10 text-emerald-400", text: "text-emerald-300", word: "POSITIVE" },
  down: { icon: "▼", chip: "bg-rose-400/10 text-rose-400", text: "text-rose-300", word: "NEGATIVE" },
  neutral: { icon: "●", chip: "bg-white/[0.06] text-zinc-400", text: "text-zinc-400", word: "NEUTRAL" },
};
const BASIS: Record<Insight["basis"], string> = {
  form4: "Source: insider's Form 4 filing (SEC XML)",
  xbrl: "Source: reported financials (SEC XBRL), year over year",
  rules: "Source: 8-K item type",
  ai: "Source: AI read of the filing's press release — verify in the document",
  none: "",
};

/** One SEC filing: arrow + one-line read on the card, the "why" on hover / focus. */
function FilingCard({ f }: { f: Filing }) {
  const [ins, setIns] = useState<Insight | null>(null);
  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams({ ticker: f.ticker, cik: String(f.cik), acc: f.accession, form: f.form, doc: f.doc, items: f.items });
    fetch(`/api/intel/insight?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Insight | null) => { if (!cancelled && j) setIns(j); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [f]);
  const a = ARROW[ins?.direction ?? "neutral"];
  return (
    <a href={f.url} target="_blank" rel="noreferrer" className="group relative flex flex-col gap-1.5 rounded-xl border border-white/[0.04] bg-black/30 px-3.5 py-3 transition-colors hover:border-white/[0.12] focus-visible:border-white/[0.2] focus-visible:outline-none">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className="rounded-md bg-sky-400/10 px-2 py-0.5 text-[11.5px] font-bold text-sky-300">{f.ticker} · {f.form}</span>
          {ins ? (
            <span className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] ${a.chip}`} aria-label={a.word}>{a.icon}</span>
          ) : <span className="h-5 w-5 animate-pulse rounded-md bg-white/[0.05]" />}
        </span>
        <span className="text-[11px] text-zinc-500">{when(f.acceptedAt)}</span>
      </div>
      <span className="font-sans text-[13.5px] text-zinc-200 group-hover:text-white">{f.description}</span>
      {ins ? <span className={`truncate text-[11.5px] ${a.text}`}>{ins.headline}</span> : <span className="h-3 w-2/3 animate-pulse rounded bg-white/[0.04]" />}

      {/* Why — on hover / keyboard focus */}
      {ins && ins.detail && (
        <span role="tooltip" className="pointer-events-none absolute left-2 right-2 top-[calc(100%+6px)] z-30 hidden flex-col gap-1.5 rounded-xl border border-white/[0.1] bg-[#0a0a0c] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.7)] group-hover:flex group-focus-visible:flex">
          <span className={`text-[10px] font-bold tracking-[0.16em] ${a.text}`}>{a.icon} WHY {a.word}</span>
          <span className="font-sans text-[12.5px] leading-snug text-zinc-200">{ins.detail}</span>
          {BASIS[ins.basis] && <span className="text-[9.5px] tracking-[0.06em] text-zinc-600">{BASIS[ins.basis]}</span>}
        </span>
      )}
    </a>
  );
}
interface Ev { source: string; code: string; at: string; title: string; allDay?: boolean }
interface Data {
  sentiment: { sectors: Sector[]; articles: number };
  filings: { filings: Filing[]; error?: string };
  calendar: { events: Ev[]; missing: string[] };
}

const REGIONS: [Region, string][] = [["us", "USA"], ["eu", "EUROPE"], ["asia", "ASIA"]];
const card = "rounded-2xl border border-white/[0.05] bg-[#0a0a0c]";
const label = "font-mono text-[10px] font-bold tracking-[0.16em] text-zinc-500";

/** "TODAY 14:30" · "TOMORROW 20:00" · "YESTERDAY" · "3D AGO" · "OCT 28 20:00" — in the viewer's time zone */
function when(iso: string, allDay = false): string {
  const d = new Date(iso), now = new Date();
  const dayDiff = Math.round((new Date(d.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86400_000);
  const hm = allDay ? "" : " " + d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  if (dayDiff === 0) return "TODAY" + hm;
  if (dayDiff === 1) return "TOMORROW" + hm;
  if (dayDiff === -1) return "YESTERDAY" + hm;
  if (dayDiff < -1 && dayDiff > -7) return `${-dayDiff}D AGO`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase() + hm;
}

function tone(i: number) {
  if (i >= 15) return { box: "border-emerald-400/25 bg-emerald-400/[0.04]", num: "text-emerald-400 bg-emerald-400/10" };
  if (i <= -15) return { box: "border-rose-400/25 bg-rose-400/[0.04]", num: "text-rose-400 bg-rose-400/10" };
  return { box: "border-white/[0.06] bg-white/[0.015]", num: "text-zinc-300 bg-white/[0.06]" };
}

const BADGE: Record<string, string> = {
  FED: "bg-amber-400/10 text-amber-300", FRED: "bg-sky-400/10 text-sky-300", EARN: "bg-purple-400/10 text-purple-300",
};

export default function MarketIntel() {
  const [region, setRegion] = useState<Region>("us");
  const [state, setState] = useState<{ region: Region | null; data: Data | null; error?: string }>({ region: null, data: null });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/intel?region=${region}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Data) => { if (!cancelled) setState({ region, data: d }); })
      .catch((e: Error) => { if (!cancelled) setState({ region, data: null, error: e.message }); });
    return () => { cancelled = true; };
  }, [region]);

  const loading = state.region !== region;
  const d = loading ? null : state.data;

  return (
    <div className="flex flex-col gap-4 font-mono">
      {/* Header + region */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 font-display text-[22px] font-semibold tracking-[0.04em] text-zinc-50">MARKET INTEL</h1>
          <p className="m-0 mt-1 text-[11px] tracking-[0.06em] text-zinc-500">Sector sentiment · SEC filings · macro & earnings calendar</p>
        </div>
        <Link href="/news/archive" className="text-[10.5px] font-bold tracking-[0.12em] text-zinc-500 hover:text-white">[ NEWS ARCHIVE → ]</Link>
      </div>

      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Region">
        {REGIONS.map(([id, l]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={region === id}
            onClick={() => setRegion(id)}
            className={`h-10 rounded-xl border text-[12px] font-bold tracking-[0.18em] transition-colors ${region === id ? "border-emerald-400/40 bg-emerald-400/[0.07] text-emerald-300" : "border-white/[0.05] bg-[#0a0a0c] text-zinc-500 hover:text-zinc-200"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {state.error && !loading && <p className="m-0 text-[11px] text-rose-400">⚠ {state.error}</p>}

      {/* Sector sentiment */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className={label}>SECTOR SENTIMENT · INDEX −100 TO +100 · 7D</span>
          {d && <span className="text-[10px] text-zinc-600">{d.sentiment.articles} ARTICLES</span>}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {loading && [0, 1, 2, 3].map((i) => <div key={i} className={`${card} h-[112px] animate-pulse`} />)}
          {d?.sentiment.sectors.slice(0, 8).map((s) => {
            const t = tone(s.index);
            return (
              <div key={s.id} className={`flex min-w-0 flex-col gap-2 rounded-2xl border p-4 ${t.box}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-sans text-[15px] font-semibold text-zinc-50">{s.label}</span>
                  <span className={`rounded-md px-2 py-0.5 text-[14px] font-bold tabular-nums ${t.num}`}>{s.index > 0 ? "+" : ""}{s.index}</span>
                </div>
                {s.driver ? (
                  <a href={s.driver.url || undefined} target="_blank" rel="noreferrer" className="line-clamp-2 font-sans text-[12.5px] leading-snug text-zinc-400 hover:text-zinc-200" title={`${s.driver.source}: ${s.driver.headline}`}>
                    {s.driver.headline}
                  </a>
                ) : <span className="text-[12px] text-zinc-600">—</span>}
                <span className="mt-auto text-[9.5px] tracking-[0.12em] text-zinc-600">{s.articles} ARTICLE{s.articles === 1 ? "" : "S"}</span>
              </div>
            );
          })}
        </div>
        {d && d.sentiment.sectors.length === 0 && (
          <div className={`${card} p-6 text-center text-[11px] text-zinc-500`}>
            No archived news for this region in the last 7 days.{" "}
            <Link href="/news/archive" className="font-bold text-emerald-400 hover:text-emerald-300">[ COLLECT / BACKFILL → ]</Link>
          </div>
        )}
      </section>

      {/* Filings + calendar */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className={`${card} flex min-w-0 flex-col gap-3 p-4`}>
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 font-sans text-[18px] font-semibold text-zinc-50">Latest SEC Filings</h2>
            <span className={label}>EDGAR</span>
          </div>
          {loading && [0, 1, 2].map((i) => <div key={i} className="h-[62px] animate-pulse rounded-xl bg-white/[0.03]" />)}
          {d?.filings.error && <p className="m-0 text-[11px] text-amber-400">⚠ SEC unavailable ({d.filings.error}). Set SEC_USER_AGENT in .env.local.</p>}
          {d?.filings.filings.map((f) => <FilingCard key={f.accession} f={f} />)}
          {d && !d.filings.error && d.filings.filings.length === 0 && <p className="m-0 text-[11px] text-zinc-600">No recent filings.</p>}
        </section>

        <section className={`${card} flex min-w-0 flex-col gap-3 p-4`}>
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 font-sans text-[18px] font-semibold text-zinc-50">Macro & Earnings Calendar</h2>
            <span className={label}>NEXT 14D</span>
          </div>
          {loading && [0, 1, 2].map((i) => <div key={i} className="h-[62px] animate-pulse rounded-xl bg-white/[0.03]" />)}
          {d?.calendar.events.slice(0, 10).map((e) => (
            <div key={`${e.source}-${e.code}-${e.at}`} className="flex flex-col gap-1.5 rounded-xl border border-white/[0.04] bg-black/30 px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-md px-2 py-0.5 text-[11.5px] font-bold ${BADGE[e.source] ?? "bg-white/[0.06] text-zinc-300"}`}>{e.source} · {e.code}</span>
                <span className="text-[11px] text-zinc-500">{when(e.at, e.allDay)}</span>
              </div>
              <span className="font-sans text-[13.5px] text-zinc-200">{e.title}</span>
            </div>
          ))}
          {d && d.calendar.events.length === 0 && <p className="m-0 text-[11px] text-zinc-600">Nothing scheduled in the next 14 days.</p>}
          {d && d.calendar.missing.length > 0 && (
            <p className="m-0 text-[10.5px] text-amber-400/80">Add {d.calendar.missing.join(" + ")} to .env.local for {d.calendar.missing.includes("FRED_API_KEY") ? "CPI / jobs / GDP dates" : ""}{d.calendar.missing.length > 1 ? " and " : ""}{d.calendar.missing.includes("FINNHUB_API_KEY") ? "earnings" : ""}.</p>
          )}
        </section>
      </div>
    </div>
  );
}
