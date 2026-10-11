"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/* Market Intel
   ┌ region ─────────────────────────────────────────────────────────┐
   │ sentiment: TECHNOLOGY · DEFENSE                                  │
   │ sector switch  [ TECHNOLOGY | DEFENSE ]                          │
   │ SEC filings (sector) │ Commodities (sector + all) │ Macro (all)  │
   └──────────────────────────────────────────────────────────────────┘ */

type Region = "us" | "eu" | "asia";
type SectorId = "tech" | "defense";
interface Sector { id: SectorId; label: string; index: number; articles: number; driver: { headline: string; url: string; source: string } | null }
interface Filing { ticker: string; company: string; form: string; acceptedAt: string; description: string; url: string; cik: number; accession: string; doc: string; items: string }
interface Insight { direction: "up" | "down" | "neutral"; headline: string; detail: string; basis: "form4" | "xbrl" | "rules" | "ai" | "none"; importance: number; sector?: string }
interface Commodity { id: string; ts: number; headline: string; url: string; source: string; commodity: string; tag: { sectors: string[]; importance: number; why: string; basis: "ai" | "rules" } }
interface Ev { source: string; code: string; at: string; title: string; allDay?: boolean }
interface MacroNews { id: string; ts: number; headline: string; url: string; source: string }
interface Data {
  picks?: { filers: string[]; commodities: string[] };
  sentiment: { sectors: Sector[]; articles: number };
  filings: { filings: Filing[]; error?: string };
  commodities: { items: Commodity[]; pending: number };
  macro: { calendar: { events: Ev[]; missing: string[] }; news: MacroNews[] };
}

const REGIONS: [Region, string][] = [["us", "USA"], ["eu", "EUROPE"], ["asia", "ASIA"]];
const SECTORS: [SectorId, string][] = [["tech", "TECHNOLOGY"], ["defense", "DEFENSE"]];
const card = "rounded-2xl border border-white/[0.05] bg-[#0a0a0c]";
const label = "font-mono text-[10px] font-bold tracking-[0.16em] text-zinc-500";

/** "TODAY 14:30" · "TOMORROW 20:00" · "YESTERDAY" · "3D AGO" · "OCT 28 20:00" — viewer's time zone */
function when(iso: string | number, allDay = false): string {
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
const BADGE: Record<string, string> = { FED: "bg-amber-400/10 text-amber-300", FRED: "bg-sky-400/10 text-sky-300", EARN: "bg-purple-400/10 text-purple-300" };

/** 5-bar importance meter */
function Weight({ n }: { n: number }) {
  return (
    <span className="flex items-end gap-[2px]" title={`Importance ${n}/5`} aria-label={`Importance ${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`w-[3px] rounded-[1px] ${i <= n ? (n >= 4 ? "bg-amber-400" : "bg-zinc-300") : "bg-white/[0.08]"}`} style={{ height: 4 + i * 2 }} />
      ))}
    </span>
  );
}

function SectorChip({ s }: { s?: string }) {
  const label = s && s === s.toLowerCase() ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : s; // AI may answer "defense"
  return label ? <span className="rounded border border-white/[0.08] px-1.5 py-px text-[9.5px] tracking-[0.06em] text-zinc-400">{label}</span> : null;
}

/** Hover / focus popover */
function Why({ title, cls, body, foot }: { title: string; cls: string; body: string; foot?: string }) {
  return (
    <span role="tooltip" className="pointer-events-none absolute left-2 right-2 top-[calc(100%+6px)] z-30 hidden flex-col gap-1.5 rounded-xl border border-white/[0.1] bg-[#0a0a0c] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.7)] group-hover:flex group-focus-visible:flex">
      <span className={`text-[10px] font-bold tracking-[0.16em] ${cls}`}>{title}</span>
      <span className="font-sans text-[12.5px] leading-snug text-zinc-200">{body}</span>
      {foot && <span className="text-[9.5px] tracking-[0.06em] text-zinc-600">{foot}</span>}
    </span>
  );
}

/* ── Quick filter: 4–5 main options + a small "+" tile to type any other ── */
function PickBar({ options, value, onChange, placeholder, upper }: { options: string[]; value: string | null; onChange: (v: string | null) => void; placeholder: string; upper?: boolean }) {
  const [typing, setTyping] = useState(false);
  const [q, setQ] = useState("");
  const chip = (on: boolean) =>
    `h-7 rounded-md border px-2.5 text-[10.5px] font-bold tracking-[0.1em] transition-colors ${on ? "border-white/[0.2] bg-white/[0.08] text-white" : "border-white/[0.05] bg-[#030303] text-zinc-500 hover:text-zinc-200"}`;
  const custom = value && !options.some((o) => o.toLowerCase() === value.toLowerCase()) ? value : null;
  const submit = () => {
    const v = q.trim();
    if (v) onChange(upper ? v.toUpperCase() : v);
    setQ("");
    setTyping(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => {
        const on = value?.toLowerCase() === o.toLowerCase();
        return (
          <button key={o} type="button" aria-pressed={on} onClick={() => onChange(on ? null : o)} className={chip(on)}>
            {o.toUpperCase()}
          </button>
        );
      })}
      {custom && (
        <button type="button" onClick={() => onChange(null)} title="Clear" className={`${chip(true)} flex items-center gap-1.5`}>
          {custom.toUpperCase()} <span className="text-zinc-500">×</span>
        </button>
      )}
      {typing ? (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); setTyping(false); } }}
            placeholder={placeholder}
            maxLength={24}
            className="h-7 w-28 rounded-md border border-white/[0.2] bg-[#030303] px-2 text-[10.5px] font-bold tracking-[0.08em] text-white outline-none placeholder:font-normal placeholder:text-zinc-600"
          />
        </form>
      ) : (
        <button type="button" onClick={() => setTyping(true)} title={placeholder} aria-label={placeholder} className={`${chip(false)} w-7 px-0 text-[13px]`}>
          +
        </button>
      )}
    </div>
  );
}

/** Fetches `url` when it changes (null = nothing to fetch). */
function useFetch<T>(url: string | null) {
  const [st, setSt] = useState<{ url: string | null; data: T | null; error?: string }>({ url: null, data: null });
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url, { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`))))
      .then((data: T) => { if (!cancelled) setSt({ url, data }); })
      .catch((e: Error) => { if (!cancelled) setSt({ url, data: null, error: e.message }); });
    return () => { cancelled = true; };
  }, [url]);
  return { data: st.url === url ? st.data : null, error: st.url === url ? st.error : undefined, loading: !!url && st.url !== url };
}

/* ── SEC filings: fetch every insight, then sort by importance or time ── */
function FilingsPanel({ filings: sectorFilings, error: sectorError, loading: sectorLoading, picks }: { filings: Filing[]; error?: string; loading: boolean; picks: string[] }) {
  const [pick, setPick] = useState<string | null>(null);
  const one = useFetch<{ filings: Filing[]; error?: string }>(pick ? `/api/intel/filings?ticker=${encodeURIComponent(pick)}` : null);
  const pickedFilings = one.data?.filings;
  const filings = useMemo(() => (pick ? pickedFilings ?? [] : sectorFilings), [pick, pickedFilings, sectorFilings]);
  const loading = pick ? one.loading : sectorLoading;
  const error = pick ? one.error ?? one.data?.error : sectorError;
  const [insights, setInsights] = useState<Record<string, Insight>>({});
  const [sort, setSort] = useState<"weight" | "time">("weight");

  useEffect(() => {
    let cancelled = false;
    for (const f of filings) {
      const q = new URLSearchParams({ ticker: f.ticker, cik: String(f.cik), acc: f.accession, form: f.form, doc: f.doc, items: f.items });
      fetch(`/api/intel/insight?${q}`)
        .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`))))
        .then((j: Insight) => { if (!cancelled) setInsights((m) => ({ ...m, [f.accession]: j })); })
        .catch((e: Error) => { if (!cancelled) setInsights((m) => ({ ...m, [f.accession]: { direction: "neutral", basis: "none", importance: 1, headline: "—", detail: `Insight unavailable (${e.message}).` } })); });
    }
    return () => { cancelled = true; };
  }, [filings]);

  const rows = useMemo(() => {
    const list = [...filings];
    if (sort === "weight") list.sort((a, b) => (insights[b.accession]?.importance ?? 0) - (insights[a.accession]?.importance ?? 0) || b.acceptedAt.localeCompare(a.acceptedAt));
    return list;
  }, [filings, insights, sort]);

  return (
    <section className={`${card} flex min-w-0 flex-col gap-3 p-4`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 font-sans text-[17px] font-semibold text-zinc-50">SEC Filings</h2>
        <div className="flex rounded-md border border-white/[0.05] bg-[#030303] p-0.5">
          {(["weight", "time"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setSort(k)} className={`h-6 rounded px-2 text-[9.5px] font-bold tracking-[0.12em] ${sort === k ? "bg-white/[0.08] text-white" : "text-zinc-500 hover:text-zinc-200"}`}>
              {k === "weight" ? "IMPORTANT" : "LATEST"}
            </button>
          ))}
        </div>
      </div>
      <PickBar options={picks} value={pick} onChange={setPick} placeholder="Any ticker…" upper />
      {loading && [0, 1, 2].map((i) => <div key={i} className="h-[74px] animate-pulse rounded-xl bg-white/[0.03]" />)}
      {error && <p className="m-0 text-[11px] text-amber-400">⚠ SEC unavailable ({error}). Check SEC_USER_AGENT in .env.local.</p>}
      {!loading && rows.map((f) => {
        const ins = insights[f.accession];
        const a = ARROW[ins?.direction ?? "neutral"];
        return (
          <a key={f.accession} href={f.url} target="_blank" rel="noreferrer" className="group relative flex flex-col gap-1.5 rounded-xl border border-white/[0.04] bg-black/30 px-3.5 py-3 transition-colors hover:border-white/[0.12] focus-visible:border-white/[0.2] focus-visible:outline-none">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="whitespace-nowrap rounded-md bg-sky-400/10 px-2 py-0.5 text-[11.5px] font-bold text-sky-300">{f.ticker} · {f.form}</span>
                {ins ? <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-md text-[10px] ${a.chip}`} aria-label={a.word}>{a.icon}</span> : <span className="h-5 w-5 animate-pulse rounded-md bg-white/[0.05]" />}
                {ins && <Weight n={ins.importance} />}
              </span>
              <span className="whitespace-nowrap text-[10.5px] text-zinc-500">{when(f.acceptedAt)}</span>
            </div>
            <span className="font-sans text-[13.5px] text-zinc-200 group-hover:text-white">{f.description}</span>
            {ins ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className={`min-w-0 truncate text-[11.5px] ${a.text}`}>{ins.headline}</span>
                <span className="ml-auto flex-none"><SectorChip s={ins.sector} /></span>
              </span>
            ) : <span className="h-3 w-2/3 animate-pulse rounded bg-white/[0.04]" />}
            {ins?.detail && <Why title={`${a.icon} WHY ${a.word} · IMPORTANCE ${ins.importance}/5`} cls={a.text} body={ins.detail} foot={BASIS[ins.basis]} />}
          </a>
        );
      })}
      {!loading && !error && rows.length === 0 && <p className="m-0 text-[11px] text-zinc-600">{pick ? `No SEC filings for ${pick} (not an SEC-registered ticker?).` : "No SEC filers tracked for this sector in this region."}</p>}
    </section>
  );
}

/* ── Commodities: sector-relevant by default, or one commodity picked from the tiles ── */
function CommoditiesPanel({ items: sectorItems, loading: sectorLoading, ready, picks }: { items: Commodity[]; loading: boolean; ready: boolean; picks: string[] }) {
  const [pick, setPick] = useState<string | null>(null);
  const one = useFetch<{ items: Commodity[] }>(pick ? `/api/intel/commodity?name=${encodeURIComponent(pick)}` : null);
  const items = pick ? one.data?.items ?? [] : sectorItems;
  const loading = pick ? one.loading : sectorLoading;
  return (
        <section className={`${card} flex min-w-0 flex-col gap-3 p-4`}>
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 font-sans text-[17px] font-semibold text-zinc-50">Commodities</h2>
            <span className={label}>{pick ? "14D · ALL SECTORS" : "7D"}</span>
          </div>
          <PickBar options={picks} value={pick} onChange={setPick} placeholder="Any commodity…" />
          {loading && [0, 1, 2].map((i) => <div key={i} className="h-[66px] animate-pulse rounded-xl bg-white/[0.03]" />)}
          {!loading && items.map((c) => {
            const all = c.tag.sectors.includes("all");
            return (
              <a key={c.id} href={c.url || undefined} target="_blank" rel="noreferrer" className="group relative flex flex-col gap-1.5 rounded-xl border border-white/[0.04] bg-black/30 px-3.5 py-3 transition-colors hover:border-white/[0.12]">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="rounded-md bg-amber-400/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">{c.commodity.toUpperCase()}</span>
                    <Weight n={c.tag.importance} />
                  </span>
                  <span className="text-[10.5px] text-zinc-500">{when(c.ts * 1000)}</span>
                </div>
                <span className="line-clamp-2 font-sans text-[13px] text-zinc-200 group-hover:text-white">{c.headline}</span>
                <span className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-[11px] text-zinc-400">{c.tag.why}</span>
                  <span className="ml-auto flex flex-none gap-1">
                    {all ? <SectorChip s="ALL SECTORS" /> : c.tag.sectors.map((s) => <SectorChip key={s} s={s === "tech" ? "Technology" : "Defense"} />)}
                  </span>
                </span>
                <Why title={`IMPACT · IMPORTANCE ${c.tag.importance}/5`} cls="text-amber-300" body={`${c.tag.why}. Source: ${c.source}.`} foot={c.tag.basis === "ai" ? "Sector impact judged by AI from the headline/summary" : "Sector impact from keyword rules (add GEMINI_API_KEY for AI tagging)"} />
              </a>
            );
          })}
          {one.error && <p className="m-0 text-[11px] text-amber-400">⚠ {one.error}</p>}
          {!loading && (ready || pick) && items.length === 0 && <p className="m-0 text-[11px] text-zinc-600">{pick ? `No news about ${pick} in 14 days.` : "No commodity news affecting this sector in 7 days."}</p>}
        </section>
  );
}

export default function MarketIntel() {
  const [region, setRegion] = useState<Region>("us");
  const [sector, setSector] = useState<SectorId>("tech");
  const key = `${region}:${sector}`;
  const [state, setState] = useState<{ key: string; data: Data | null; error?: string }>({ key: "", data: null });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/intel?region=${region}&sector=${sector}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Data) => { if (!cancelled) setState({ key, data: d }); })
      .catch((e: Error) => { if (!cancelled) setState((s) => ({ key, data: s.data, error: e.message })); });
    return () => { cancelled = true; };
  }, [region, sector, key]);

  const loading = state.key !== key;
  // state.data keeps the previous response while the next region/sector loads (no flicker of the tiles)
  const d = state.data;
  const filings = useMemo(() => (loading ? [] : d?.filings.filings ?? []), [loading, d]);

  return (
    <div className="flex flex-col gap-4 font-mono">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 font-display text-[22px] font-semibold tracking-[0.04em] text-zinc-50">MARKET INTEL</h1>
          <p className="m-0 mt-1 text-[11px] tracking-[0.06em] text-zinc-500">Sector sentiment · SEC filings · commodities · macro</p>
        </div>
        <Link href="/news/archive" className="text-[10.5px] font-bold tracking-[0.12em] text-zinc-500 hover:text-white">[ NEWS ARCHIVE → ]</Link>
      </div>

      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Region">
        {REGIONS.map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={region === id} onClick={() => setRegion(id)}
            className={`h-10 rounded-xl border text-[12px] font-bold tracking-[0.18em] transition-colors ${region === id ? "border-emerald-400/40 bg-emerald-400/[0.07] text-emerald-300" : "border-white/[0.05] bg-[#0a0a0c] text-zinc-500 hover:text-zinc-200"}`}>
            {l}
          </button>
        ))}
      </div>
      {state.error && !loading && <p className="m-0 text-[11px] text-rose-400">⚠ {state.error}</p>}

      {/* Sentiment — the two focus sectors (click = select) */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className={label}>SECTOR SENTIMENT · INDEX −100 TO +100 · 7D</span>
          {d && <span className="text-[10px] text-zinc-600">{d.sentiment.articles} ARTICLES</span>}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {!d && [0, 1].map((i) => <div key={i} className={`${card} h-[112px] animate-pulse`} />)}
          {d?.sentiment.sectors.map((s) => {
            const t = tone(s.index), on = s.id === sector;
            return (
              <button key={s.id} type="button" onClick={() => setSector(s.id)} aria-pressed={on}
                className={`flex min-w-0 flex-col gap-2 rounded-2xl border p-4 text-left transition-[box-shadow] ${t.box} ${on ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]" : "opacity-80 hover:opacity-100"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-sans text-[15px] font-semibold text-zinc-50">{s.label}</span>
                  <span className={`rounded-md px-2 py-0.5 text-[14px] font-bold tabular-nums ${t.num}`}>{s.index > 0 ? "+" : ""}{s.index}</span>
                </div>
                <span className="line-clamp-2 font-sans text-[12.5px] leading-snug text-zinc-400" title={s.driver ? `${s.driver.source}: ${s.driver.headline}` : undefined}>{s.driver?.headline ?? "No archived news in 7 days."}</span>
                <span className="mt-auto text-[9.5px] tracking-[0.12em] text-zinc-600">{s.articles} ARTICLE{s.articles === 1 ? "" : "S"}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Sector switch */}
      <div className="flex items-center gap-3 border-y border-white/[0.05] py-2.5">
        <span className={label}>SECTOR</span>
        <div className="flex rounded-lg border border-white/[0.05] bg-[#0a0a0c] p-0.5" role="tablist" aria-label="Sector">
          {SECTORS.map(([id, l]) => (
            <button key={id} type="button" role="tab" aria-selected={sector === id} onClick={() => setSector(id)}
              className={`h-8 rounded-md px-4 text-[11px] font-bold tracking-[0.16em] ${sector === id ? "bg-white/[0.08] text-white" : "text-zinc-500 hover:text-zinc-200"}`}>
              {l}
            </button>
          ))}
        </div>
        <span className="ml-auto hidden text-[10px] tracking-[0.08em] text-zinc-600 md:inline">Commodities shown: this sector + market-wide · Macro: all sectors</span>
      </div>

      {/* Three pillars */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <FilingsPanel key={`f-${key}`} filings={filings} error={loading ? undefined : d?.filings.error} loading={loading} picks={d?.picks?.filers ?? []} />

        <CommoditiesPanel key={`c-${key}`} items={d?.commodities.items ?? []} loading={loading} ready={!!d} picks={d?.picks?.commodities ?? []} />

        <section className={`${card} flex min-w-0 flex-col gap-3 p-4`}>
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 font-sans text-[17px] font-semibold text-zinc-50">Macro</h2>
            <span className={label}>ALL SECTORS</span>
          </div>
          {loading && [0, 1, 2].map((i) => <div key={i} className="h-[58px] animate-pulse rounded-xl bg-white/[0.03]" />)}
          {!loading && d?.macro.calendar.events.slice(0, 5).map((e) => (
            <div key={`${e.source}-${e.code}-${e.at}`} className="flex flex-col gap-1.5 rounded-xl border border-white/[0.04] bg-black/30 px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${BADGE[e.source] ?? "bg-white/[0.06] text-zinc-300"}`}>{e.source} · {e.code}</span>
                <span className="text-[10.5px] text-zinc-500">{when(e.at, e.allDay)}</span>
              </div>
              <span className="font-sans text-[13px] text-zinc-200">{e.title}</span>
            </div>
          ))}
          {!loading && d && d.macro.news.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-white/[0.05] pt-3">
              <span className={label}>MACRO NEWS</span>
              {d.macro.news.map((n) => (
                <a key={n.id} href={n.url || undefined} target="_blank" rel="noreferrer" className="flex gap-3 text-[12.5px] hover:text-white">
                  <span className="w-[52px] flex-none pt-0.5 text-[10px] text-zinc-600">{when(n.ts * 1000).replace(/ \d\d:\d\d$/, "")}</span>
                  <span className="line-clamp-2 font-sans text-zinc-300">{n.headline}</span>
                </a>
              ))}
            </div>
          )}
          {!loading && d && d.macro.calendar.missing.length > 0 && (
            <p className="m-0 text-[10.5px] text-amber-400/80">Add {d.macro.calendar.missing.join(" + ")} to .env.local for the full calendar.</p>
          )}
        </section>
      </div>
    </div>
  );
}
