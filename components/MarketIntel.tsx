"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EventCalendar from "@/components/EventCalendar";
import AwaitedEvents from "@/components/AwaitedEvents";
import { LookThroughFeed } from "@/components/PortfolioTelemetry";
import { useMyPortfolio } from "@/lib/my-portfolio";
import NewsCharts, { proxiesFor } from "@/components/NewsCharts";
import EarningsPanel from "@/components/EarningsPanel";
import { NewsFeed } from "@/components/MarketPulse";

/** [ CHART ▾ ] toggle used on every news card */
function ChartBtn({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }} aria-expanded={open}
      className={`flex-none rounded-sm border px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-[0.1em] transition-colors ${open ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-white/[0.08] text-zinc-500 hover:text-white"}`}>
      CHART {open ? "▴" : "▾"}
    </button>
  );
}

/* Market News
   ┌ region ─────────────────────────────────────────────────────────┐
   │ sector switch  [ TECHNOLOGY | DEFENSE ]                          │
   │ SEC filings (sector) │ Commodities (sector + all) │ Macro (all)  │
   └──────────────────────────────────────────────────────────────────┘ */

type Region = "global" | "us" | "eu" | "asia";
type SectorId = "tech" | "defense";
interface Filing { ticker: string; company: string; form: string; acceptedAt: string; description: string; url: string; cik: number; accession: string; doc: string; items: string }
interface Insight { direction: "up" | "down" | "neutral"; headline: string; detail: string; basis: "form4" | "xbrl" | "rules" | "ai" | "none"; importance: number; sector?: string }
interface Commodity { id: string; ts: number; headline: string; url: string; source: string; commodity: string; tag: { sectors: string[]; importance: number; why: string; basis: "ai" | "rules" } }
interface Ev { source: string; code: string; at: string; title: string; allDay?: boolean }
interface MacroNews { id: string; ts: number; headline: string; url: string; source: string; tickers?: string[] }
interface Data {
  picks?: { filers: string[]; commodities: string[] };
  filings: { filings: Filing[]; error?: string };
  commodities: { items: Commodity[]; pending: number };
  macro: { calendar: { events: Ev[]; missing: string[] }; news: MacroNews[] };
}

const REGIONS: [Region, string][] = [["global", "GLOBAL"], ["us", "USA"], ["eu", "EUROPE"], ["asia", "ASIA"]];
const SECTORS: [SectorId, string][] = [["tech", "TECHNOLOGY"], ["defense", "DEFENSE"]];
const card = "oasis-glass border border-white/[0.06] bg-[var(--oasis-panel)]";
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

const ARROW: Record<Insight["direction"], { icon: string; chip: string; text: string; word: string }> = {
  up: { icon: "▲", chip: "bg-emerald-400/10 text-emerald-400", text: "text-emerald-300", word: "POSITIVE" },
  down: { icon: "▼", chip: "bg-rose-400/10 text-rose-400", text: "text-rose-300", word: "NEGATIVE" },
  neutral: { icon: "●", chip: "bg-white/[0.06] text-zinc-400", text: "text-zinc-400", word: "NEUTRAL" },
};
const BASIS: Record<Insight["basis"], string> = {
  form4: "SRC: SEC FORM 4 (XML)",
  xbrl: "SRC: SEC XBRL FINANCIALS · Y/Y",
  rules: "SRC: 8-K ITEM CODE",
  ai: "SRC: LLM PARSE OF PRESS RELEASE · VERIFY IN FILING",
  none: "",
};
const BADGE: Record<string, string> = { FED: "bg-amber-400/10 text-amber-300", FRED: "bg-sky-400/10 text-sky-300", EARN: "bg-red-500/15 text-red-300", MKT: "bg-violet-400/15 text-violet-300" };

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
    <span role="tooltip" className="pointer-events-none absolute left-2 right-2 top-[calc(100%+6px)] z-30 hidden flex-col gap-1.5 rounded-sm border border-white/[0.1] bg-[var(--oasis-panel)] p-3 group-hover:flex group-focus-visible:flex">
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
    `h-7 rounded-sm border px-2.5 text-[10.5px] font-bold tracking-[0.1em] transition-colors ${on ? "oasis-on" : "border-white/[0.06] bg-[var(--oasis-bg)] text-zinc-500 hover:text-zinc-200"}`;
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
            className="h-7 w-28 rounded-sm border border-white/[0.2] bg-[var(--oasis-bg)] px-2 text-[10.5px] font-bold tracking-[0.08em] text-white outline-none placeholder:font-normal placeholder:text-zinc-600"
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
const FORM_W: Record<string, number> = { "8-K": 6, "6-K": 5, "10-K": 4, "20-F": 4, "10-Q": 3, "4": 2 };

function FilingsPanel({ filings: sectorFilings, error: sectorError, loading: sectorLoading, picks }: { filings: Filing[]; error?: string; loading: boolean; picks: string[] }) {
  const [openChart, setOpenChart] = useState<string | null>(null);
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
    // IMPORTANT = AI/rule importance first, then the weight of the form itself (8-K event > 10-K/10-Q > insider Form 4)
    const rank = (f: Filing) => (insights[f.accession]?.importance ?? 0) * 10 + (FORM_W[f.form] ?? 1);
    if (sort === "weight") list.sort((a, b) => rank(b) - rank(a) || b.acceptedAt.localeCompare(a.acceptedAt));
    else list.sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
    // one card per company (its most important / newest filing), few at once
    const seen = new Set<string>();
    return list.filter((f) => (pick ? true : !seen.has(f.ticker) && !!seen.add(f.ticker)));
  }, [filings, insights, sort, pick]);
  const [more, setMore] = useState(false);
  const visible = rows.slice(0, more ? 12 : 5);

  return (
    <section className={`${card} flex min-w-0 flex-col gap-3 p-4`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 font-mono text-[12px] font-bold tracking-[0.16em] text-zinc-200">[ SEC FILINGS ]</h2>
        <div className="flex rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] p-0.5">
          {(["weight", "time"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setSort(k)} className={`h-6 rounded px-2 text-[9.5px] font-bold tracking-[0.12em] ${sort === k ? "oasis-on" : "text-zinc-500 hover:text-zinc-200"}`}>
              {k === "weight" ? "IMPORTANT" : "LATEST"}
            </button>
          ))}
        </div>
      </div>
      <PickBar options={picks} value={pick} onChange={setPick} placeholder="Any ticker…" upper />
      {loading && [0, 1, 2].map((i) => <div key={i} className="h-[74px] animate-pulse rounded-sm bg-white/[0.03]" />)}
      {error && <p className="m-0 text-[11px] text-amber-400">⚠ SEC unavailable ({error}). Check SEC_USER_AGENT in .env.local.</p>}
      {!loading && visible.map((f) => {
        const ins = insights[f.accession];
        const a = ARROW[ins?.direction ?? "neutral"];
        return (
          <div key={f.accession} className="group relative flex flex-col gap-1.5 rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] px-3.5 py-3 transition-colors hover:border-white/[0.12]">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="whitespace-nowrap rounded-sm bg-sky-400/10 px-2 py-0.5 text-[11.5px] font-bold text-sky-300">{f.ticker} · {f.form}</span>
                {ins ? <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-sm text-[10px] ${a.chip}`} aria-label={a.word}>{a.icon}</span> : <span className="h-5 w-5 animate-pulse rounded-sm bg-white/[0.05]" />}
                {ins && <Weight n={ins.importance} />}
              </span>
              <span className="flex items-center gap-2">
                <span className="whitespace-nowrap text-[10.5px] text-zinc-500">{when(f.acceptedAt)}</span>
                <ChartBtn open={openChart === f.accession} onClick={() => setOpenChart((o) => (o === f.accession ? null : f.accession))} />
              </span>
            </div>
            <a href={f.url} target="_blank" rel="noreferrer" className="font-sans text-[13.5px] text-zinc-200 hover:text-white hover:underline">{f.description}</a>
            {ins ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className={`min-w-0 truncate text-[11.5px] ${a.text}`}>{ins.headline}</span>
                <span className="ml-auto flex-none"><SectorChip s={ins.sector} /></span>
              </span>
            ) : <span className="h-3 w-2/3 animate-pulse rounded bg-white/[0.04]" />}
            {ins?.detail && <Why title={`${a.icon} WHY ${a.word} · IMPORTANCE ${ins.importance}/5`} cls={a.text} body={ins.detail} foot={BASIS[ins.basis]} />}
            {openChart === f.accession && <NewsCharts symbols={[f.ticker, "SPY"]} ts={Date.parse(f.acceptedAt) / 1000} />}
          </div>
        );
      })}
      {!loading && rows.length > 5 && (
        <button type="button" onClick={() => setMore((v) => !v)} className="self-start font-mono text-[10.5px] tracking-[0.12em] text-zinc-500 hover:text-white">{more ? "[ SHOW LESS ]" : `[ + ${Math.min(12, rows.length) - 5} MORE COMPANIES ]`}</button>
      )}
      {!loading && !error && rows.length === 0 && <p className="m-0 text-[11px] text-zinc-600">{pick ? `No SEC filings for ${pick} (not an SEC-registered ticker?).` : "No SEC filers tracked for this sector in this region."}</p>}
    </section>
  );
}

/* ── Commodities: sector-relevant by default, or one commodity picked from the tiles ── */
function CommoditiesPanel({ items: sectorItems, loading: sectorLoading, ready, picks }: { items: Commodity[]; loading: boolean; ready: boolean; picks: string[] }) {
  const [openChart, setOpenChart] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const one = useFetch<{ items: Commodity[] }>(pick ? `/api/intel/commodity?name=${encodeURIComponent(pick)}` : null);
  const items = pick ? one.data?.items ?? [] : sectorItems;
  const loading = pick ? one.loading : sectorLoading;
  return (
        <section className={`${card} flex min-w-0 flex-col gap-3 p-4`}>
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 font-mono text-[12px] font-bold tracking-[0.16em] text-zinc-200">[ COMMODITIES ]</h2>
            <span className={label}>{pick ? "14D · ALL SECTORS" : "7D"}</span>
          </div>
          <PickBar options={picks} value={pick} onChange={setPick} placeholder="Any commodity…" />
          {loading && [0, 1, 2].map((i) => <div key={i} className="h-[66px] animate-pulse rounded-sm bg-white/[0.03]" />)}
          {!loading && items.map((c) => {
            const all = c.tag.sectors.includes("all");
            return (
              <div key={c.id} className="group relative flex flex-col gap-1.5 rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] px-3.5 py-3 transition-colors hover:border-white/[0.12]">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="rounded-sm bg-amber-400/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">{c.commodity.toUpperCase()}</span>
                    <Weight n={c.tag.importance} />
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10.5px] text-zinc-500">{when(c.ts * 1000)}</span>
                    <ChartBtn open={openChart === c.id} onClick={() => setOpenChart((o) => (o === c.id ? null : c.id))} />
                  </span>
                </div>
                <a href={c.url || undefined} target="_blank" rel="noreferrer" className="line-clamp-2 font-sans text-[13px] text-zinc-200 hover:text-white hover:underline">{c.headline}</a>
                <span className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-[11px] text-zinc-400">{c.tag.why}</span>
                  <span className="ml-auto flex flex-none gap-1">
                    {all ? <SectorChip s="ALL SECTORS" /> : c.tag.sectors.map((s) => <SectorChip key={s} s={s === "tech" ? "Technology" : "Defense"} />)}
                  </span>
                </span>
                <Why title={`IMPACT · IMPORTANCE ${c.tag.importance}/5`} cls="text-amber-300" body={`${c.tag.why}. Source: ${c.source}.`} foot={c.tag.basis === "ai" ? "SRC: LLM TAG OF HEADLINE · UNVERIFIED" : "SRC: KEYWORD RULES"} />
                {openChart === c.id && <NewsCharts symbols={proxiesFor(c.commodity)} ts={c.ts} />}
              </div>
            );
          })}
          {one.error && <p className="m-0 text-[11px] text-amber-400">⚠ {one.error}</p>}
          {!loading && (ready || pick) && items.length === 0 && <p className="m-0 text-[11px] text-zinc-600">{pick ? `No news about ${pick} in 14 days.` : "No commodity news affecting this sector in 7 days."}</p>}
        </section>
  );
}

function H2({ t, right }: { t: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
      <h2 className="m-0 font-mono text-[13px] font-bold tracking-[0.16em] text-zinc-100">[ {t} ]</h2>
      {right}
    </div>
  );
}

export default function MarketIntel() {
  const [openMacro, setOpenMacro] = useState<string | null>(null);
  const [region, setRegion] = useState<Region>("global");
  const [sector, setSector] = useState<SectorId>("tech");
  /** third switch option: news for what YOU hold (look-through of the saved portfolio) */
  const [mine, setMine] = useState(false);
  const myPos = useMyPortfolio();
  const myItems = useMemo(() => myPos.map(({ asset: a, weight }) => ({ ticker: a.ticker, name: a.name, weight, kind: a.kind, sector: a.sector, ytd: a.ytd, chg1d: a.chg1d })), [myPos]);
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

  const NAV: [string, string][] = [["news", "NEWS"], ["filings", "SEC FILINGS"], ["earnings", "EARNINGS"], ["commodities", "COMMODITIES"], ["macro", "MACRO"], ["calendar", "CALENDAR"]];
  const go = (id: string) => document.getElementById(`mn-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="grid grid-cols-1 gap-4 font-mono lg:grid-cols-[190px_minmax(0,1fr)]">
      {/* left rail: jump to a section (the page also scrolls straight through all of them) */}
      <nav className="flex flex-col gap-1 self-start lg:sticky lg:top-0" aria-label="News sections">
        <span className="px-2 pb-2 font-display text-[18px] font-semibold tracking-[0.04em] text-zinc-50">MARKET NEWS</span>
        {NAV.map(([id, l]) => (
          <button key={id} type="button" onClick={() => go(id)} className="rounded-sm px-2 py-2 text-left text-[11px] font-bold tracking-[0.16em] text-zinc-400 hover:bg-white/[0.04] hover:text-white">{l}</button>
        ))}
        <Link href="/news/archive" className="mt-2 px-2 text-[10.5px] font-bold tracking-[0.12em] text-zinc-500 hover:text-white">[ NEWS ARCHIVE → ]</Link>
      </nav>

      <div className="flex min-w-0 flex-col gap-8">
        <section id="mn-news" className="flex scroll-mt-2 flex-col gap-3">
          <H2 t="NEWS" right={myItems.length > 0 ? (
            <div className="flex rounded-sm border border-white/[0.06] p-0.5">
              {([[false, "MARKET"], [true, "MY PORTFOLIO"]] as const).map(([k, l]) => (
                <button key={l} type="button" onClick={() => setMine(k)} className={`h-7 rounded-sm px-3 text-[10.5px] font-bold tracking-[0.14em] ${mine === k ? "oasis-on" : "text-zinc-500 hover:text-zinc-200"}`}>{l}</button>
              ))}
            </div>
          ) : undefined} />
          {mine && myItems.length ? <LookThroughFeed items={myItems} /> : (
            <div className={`${card} flex max-h-[560px] flex-col overflow-y-auto`}><NewsFeed limit={30} order="impact" /></div>
          )}
        </section>

        <section id="mn-filings" className="flex scroll-mt-2 flex-col gap-3">
          <H2 t="SEC FILINGS" right={
            <div className="flex flex-wrap gap-2">
              <div className="flex rounded-sm border border-white/[0.06] p-0.5" role="tablist" aria-label="Region">
                {REGIONS.map(([id, l]) => (
                  <button key={id} type="button" role="tab" aria-selected={region === id} onClick={() => setRegion(id)}
                    className={`h-7 rounded-sm px-3 text-[10.5px] font-bold tracking-[0.14em] ${region === id ? "oasis-on" : "text-zinc-500 hover:text-zinc-200"}`}>{l}</button>
                ))}
              </div>
              <div className="flex rounded-sm border border-white/[0.06] p-0.5" role="tablist" aria-label="Sector">
                {SECTORS.map(([id, l]) => (
                  <button key={id} type="button" role="tab" aria-selected={sector === id} onClick={() => setSector(id)}
                    className={`h-7 rounded-sm px-3 text-[10.5px] font-bold tracking-[0.14em] ${sector === id ? "oasis-on" : "text-zinc-500 hover:text-zinc-200"}`}>{l}</button>
                ))}
              </div>
            </div>
          } />
          {state.error && !loading && <p className="m-0 text-[11px] text-rose-400">⚠ {state.error}</p>}
          <FilingsPanel key={`f-${key}`} filings={filings} error={loading ? undefined : d?.filings.error} loading={loading} picks={d?.picks?.filers ?? []} />
        </section>

        <section id="mn-earnings" className="flex scroll-mt-2 flex-col gap-3">
          <H2 t="EARNINGS" />
          <EarningsPanel />
        </section>

        <section id="mn-commodities" className="flex scroll-mt-2 flex-col gap-3">
          <H2 t="COMMODITIES" />
          <CommoditiesPanel key={`c-${key}`} items={d?.commodities.items ?? []} loading={loading} ready={!!d} picks={d?.picks?.commodities ?? []} />
        </section>

        <section id="mn-macro" className="flex scroll-mt-2 flex-col gap-3">
          <H2 t="MACRO" />
          <div className={`${card} flex min-w-0 flex-col gap-3 p-4`}>
            {loading && [0, 1, 2].map((i) => <div key={i} className="h-[58px] animate-pulse rounded-sm bg-white/[0.03]" />)}
            {!loading && d?.macro.calendar.events.slice(0, 5).map((e) => (
              <div key={`${e.source}-${e.code}-${e.at}`} className="flex flex-col gap-1.5 rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] px-3.5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className={`rounded-sm px-2 py-0.5 text-[11px] font-bold ${BADGE[e.source] ?? "bg-white/[0.06] text-zinc-300"}`}>{e.source} · {e.code}</span>
                  <span className="text-[10.5px] text-zinc-500">{when(e.at, e.allDay)}</span>
                </div>
                <span className="font-sans text-[13px] text-zinc-200">{e.title}</span>
              </div>
            ))}
            {!loading && d && d.macro.news.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-3">
                <span className={label}>MACRO NEWS</span>
                {d.macro.news.map((n) => (
                  <div key={n.id} className="flex flex-col gap-1.5">
                    <div className="flex items-start gap-3 text-[12.5px]">
                      <span className="w-[52px] flex-none pt-0.5 text-[10px] text-zinc-600">{when(n.ts * 1000).replace(/ \d\d:\d\d$/, "")}</span>
                      <a href={n.url || undefined} target="_blank" rel="noreferrer" className="line-clamp-2 min-w-0 flex-1 font-sans text-zinc-300 hover:text-white">{n.headline}</a>
                      <ChartBtn open={openMacro === n.id} onClick={() => setOpenMacro((o) => (o === n.id ? null : n.id))} />
                    </div>
                    {openMacro === n.id && <NewsCharts symbols={[...(n.tickers ?? []), "SPY", "TLT", "UUP"]} ts={n.ts} />}
                  </div>
                ))}
              </div>
            )}
            {!loading && d && d.macro.calendar.missing.length > 0 && (
              <p className="m-0 text-[10.5px] text-amber-400/80">Add {d.macro.calendar.missing.join(" + ")} to .env.local for the full calendar.</p>
            )}
          </div>
        </section>

        <section id="mn-calendar" className="flex scroll-mt-2 flex-col gap-3">
          <H2 t="CALENDAR" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <AwaitedEvents />
            <EventCalendar />
          </div>
        </section>
      </div>
    </div>
  );
}
