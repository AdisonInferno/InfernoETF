"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, ETFS, SUBCATEGORIES, fmtAum, fmtPct, inCategory, type CategoryId, type EtfRow } from "@/lib/etfs";

/* ───────────────────────── Filter definitions ───────────────────────── */

type GroupId = "aum" | "volatility" | "dividend" | "leverage" | "issuer" | "region" | "exchange" | "currency";
type Filters = Partial<Record<GroupId, string[]>>;

const uniq = (key: keyof EtfRow) =>
  Object.entries(
    ETFS.reduce<Record<string, number>>((acc, e) => ((acc[String(e[key])] = (acc[String(e[key])] ?? 0) + 1), acc), {})
  )
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

const ICON_PATHS: Record<GroupId, string> = {
  aum: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  volatility: "M3 12h4l3-7 4 14 3-7h4",
  dividend: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 16l8-8",
  leverage: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  issuer: "M5 21V4h14v17M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4",
  region: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z",
  exchange: "M4 5h16v5H4zM4 14h16v5H4zM8 7.5h.01M8 16.5h.01",
  currency: "M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 9v.01M18 15v.01",
};

const GROUPS: { id: GroupId; label: string; options: string[]; test: (e: EtfRow, opt: string) => boolean }[] = [
  {
    id: "aum",
    label: "FUND SIZE (AUM)",
    options: ["< $1B", "$1B – $10B", "$10B – $100B", "> $100B"],
    test: (e, o) =>
      o === "< $1B" ? e.aum < 1 : o === "$1B – $10B" ? e.aum >= 1 && e.aum < 10 : o === "$10B – $100B" ? e.aum >= 10 && e.aum < 100 : e.aum >= 100,
  },
  { id: "volatility", label: "VOLATILITY", options: ["Low", "Medium", "High"], test: (e, o) => e.volatility === o },
  {
    id: "dividend",
    label: "DIVIDEND POLICY",
    options: ["Accumulating", "Low yield (< 2%)", "Medium (2–3%)", "High yield (> 3%)"],
    test: (e, o) =>
      o === "Accumulating" ? e.dividendYield === 0
      : o === "Low yield (< 2%)" ? e.dividendYield > 0 && e.dividendYield < 2
      : o === "Medium (2–3%)" ? e.dividendYield >= 2 && e.dividendYield <= 3
      : e.dividendYield > 3,
  },
  { id: "leverage", label: "LEVERAGE", options: ["1x", "2x", "3x", "Inverse"], test: (e, o) => e.leverage === o },
  { id: "issuer", label: "ISSUER", options: uniq("issuer"), test: (e, o) => e.issuer === o },
  { id: "region", label: "REGION & COUNTRY", options: uniq("region"), test: (e, o) => e.region === o },
  { id: "exchange", label: "EXCHANGE", options: uniq("exchange"), test: (e, o) => e.exchange === o },
  { id: "currency", label: "CURRENCY", options: uniq("currency"), test: (e, o) => e.currency === o },
];

type TabId = (typeof CATEGORIES)[number]["id"];
type SortKey = "default" | "aum" | "ytd" | "chg1d";

const PRESETS: { icon: string; label: string; tab: TabId; filters: Filters; sort: SortKey }[] = [
  { icon: "🚀", label: "AI & High Growth", tab: "ai-tech", filters: {}, sort: "ytd" },
  { icon: "🛡️", label: "Low Volatility / Defensive", tab: "all", filters: { volatility: ["Low"] }, sort: "aum" },
  { icon: "💰", label: "High Dividend Yield", tab: "all", filters: { dividend: ["High yield (> 3%)"] }, sort: "aum" },
];

/* ───────────────────────────── UI pieces ───────────────────────────── */

function GroupIcon({ id }: { id: GroupId }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-zinc-500">
      <path d={ICON_PATHS[id]} />
    </svg>
  );
}

function PctBadge({ v }: { v: number }) {
  return (
    <span className={`inline-block rounded-md px-2 py-[3px] font-mono text-[12px] font-bold tabular-nums ${v >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
      {fmtPct(v)}
    </span>
  );
}

const card = "rounded-3xl border border-white/[0.04] bg-[#0a0a0c]";

/* ───────────────────────────── Component ───────────────────────────── */

export default function EtfTableScanner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim();

  const [tab, setTabState] = useState<TabId>("trending");
  const [sub, setSub] = useState<string>("all");
  // Changing the main tab always resets the sub-category to "ALL".
  const setTab = (t: TabId) => { setTabState(t); setSub("all"); };
  const [filters, setFilters] = useState<Filters>({});
  const [open, setOpen] = useState<Partial<Record<GroupId, boolean>>>({});
  const [sort, setSort] = useState<SortKey>("default");

  // A search from the header shows results across all ETFs.
  useEffect(() => {
    if (query) setTab("all");
  }, [query]);

  const toggleOpt = (g: GroupId, o: string) =>
    setFilters((f) => {
      const cur = f[g] ?? [];
      const next = cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o];
      return { ...f, [g]: next };
    });

  const activeChips = GROUPS.flatMap((g) => (filters[g.id] ?? []).map((o) => ({ g: g.id, o })));
  const filterCount = activeChips.length + (query ? 1 : 0);

  const clearAll = () => {
    setFilters({});
    setSort("default");
    if (query) router.replace("/scanner");
  };

  // Filters + search, before the category tab is applied (tab counts come from this).
  const base = useMemo(() => {
    const s = query.toLowerCase();
    return ETFS.filter(
      (e) =>
        (!s || e.ticker.toLowerCase().includes(s) || e.name.toLowerCase().includes(s)) &&
        GROUPS.every((g) => {
          const sel = filters[g.id];
          return !sel?.length || sel.some((o) => g.test(e, o));
        })
    );
  }, [filters, query]);

  const inTab = (e: EtfRow, t: TabId) => (t === "all" ? true : t === "trending" ? e.trending !== undefined : inCategory(e, t));
  const subs = tab === "all" || tab === "trending" ? [] : (SUBCATEGORIES[tab as CategoryId] ?? []);
  const activeSub = subs.find((s) => s.id === sub);
  const tabLabel = CATEGORIES.find((c) => c.id === tab)?.label ?? "";

  const rows = useMemo(() => {
    const list = base.filter((e) => inTab(e, tab) && (!activeSub || activeSub.tickers.includes(e.ticker)));
    const by: Record<SortKey, (a: EtfRow, b: EtfRow) => number> = {
      default: tab === "trending" ? (a, b) => (a.trending ?? 99) - (b.trending ?? 99) : (a, b) => b.aum - a.aum,
      aum: (a, b) => b.aum - a.aum,
      ytd: (a, b) => b.ytd - a.ytd,
      chg1d: (a, b) => b.chg1d - a.chg1d,
    };
    return [...list].sort(by[sort]);
  }, [base, tab, sort, activeSub]);

  const totalAum = rows.reduce((s, e) => s + e.aum, 0);
  const avgYtd = rows.length ? rows.reduce((s, e) => s + e.ytd, 0) / rows.length : 0;

  const th = "px-3 pb-3 pt-1 text-[10px] font-semibold tracking-[0.14em] text-zinc-500";
  const sortTh = (key: SortKey, label: string) => (
    <th className={`${th} text-right`}>
      <button
        type="button"
        onClick={() => setSort((s) => (s === key ? "default" : key))}
        className={`tracking-[0.14em] transition-colors hover:text-white ${sort === key ? "text-white" : ""}`}
      >
        {label}
        {sort === key ? " ↓" : ""}
      </button>
    </th>
  );

  return (
    <div className="absolute inset-0 grid grid-cols-[260px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-4 p-4 max-lg:grid-cols-1">
      {/* ── Filter deck ── */}
      <aside className={`row-span-2 flex min-h-0 flex-col overflow-hidden ${card} max-lg:row-span-1`}>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
          <div className="mb-4 flex items-center gap-2 font-mono text-[12px] font-bold tracking-[0.14em] text-zinc-100">
            <span className="h-2 w-2 rounded-[1px] bg-emerald-400" />[ FILTER DECK ]
          </div>

          <div className="flex flex-col">
            {GROUPS.map((g) => {
              const isOpen = !!open[g.id];
              const n = filters[g.id]?.length ?? 0;
              return (
                <div key={g.id}>
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))}
                    className="flex w-full items-center gap-2.5 rounded-lg py-[7px] text-left transition-colors hover:text-white"
                  >
                    <span className={`text-[9px] text-red-500 transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                    <GroupIcon id={g.id} />
                    <span className="flex-1 font-mono text-[11.5px] font-semibold tracking-[0.1em] text-zinc-300">{g.label}</span>
                    {n > 0 && <span className="rounded bg-red-500/15 px-1.5 font-mono text-[10px] font-bold text-red-400">{n}</span>}
                  </button>
                  {isOpen && (
                    <div className="mb-2 ml-[22px] flex flex-wrap gap-1.5 pt-1">
                      {g.options.map((o) => {
                        const on = filters[g.id]?.includes(o);
                        return (
                          <button
                            key={o}
                            type="button"
                            onClick={() => toggleOpt(g.id, o)}
                            className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                              on ? "border-red-500/40 bg-red-500/[0.12] text-red-300" : "border-white/[0.06] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200"
                            }`}
                          >
                            {o}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <span className="text-[10px] font-semibold tracking-[0.14em] text-zinc-500">ACTIVE FILTERS</span>
            {filterCount === 0 ? (
              <span className="text-[11px] text-zinc-600">No filters applied</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {query && (
                  <button type="button" onClick={() => router.replace("/scanner")} className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/10">
                    Search: {query} ✕
                  </button>
                )}
                {activeChips.map(({ g, o }) => (
                  <button key={g + o} type="button" onClick={() => toggleOpt(g, o)} className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/10">
                    {o} ✕
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-auto flex flex-col gap-2 pt-6">
            <span className="px-1 text-[10px] font-semibold tracking-[0.14em] text-zinc-500">QUICK PRESETS</span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setTab(p.tab); setFilters(p.filters); setSort(p.sort); if (query) router.replace("/scanner"); }}
                className="flex items-center gap-3 rounded-xl bg-white/[0.035] px-3.5 py-2.5 text-left text-[12px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white"
              >
                <span>{p.icon}</span>[ {p.label} ]
              </button>
            ))}
            <div className="flex items-center gap-2 pt-1 font-mono text-[11px] font-semibold tracking-[0.06em] text-emerald-400">
              <span className="h-1.5 w-1.5 bg-emerald-400" />
              MATCHING ASSETS: <span className="text-white">{rows.length}</span> ETFs
            </div>
          </div>
        </div>
        <div className="flex flex-none items-center justify-between border-t border-white/[0.04] bg-white/[0.015] px-5 py-3">
          <span className="font-mono text-[10.5px] tracking-[0.12em] text-zinc-600">
            {filterCount === 0 ? "NO FILTERS" : `${filterCount} FILTER${filterCount > 1 ? "S" : ""}`}
          </span>
          <button type="button" onClick={clearAll} className="rounded-full bg-white/[0.06] px-3.5 py-1 font-mono text-[10.5px] font-bold tracking-[0.1em] text-zinc-300 transition-colors hover:bg-white/[0.12] hover:text-white">
            CLEAR
          </button>
        </div>
      </aside>

      {/* ── Ad slot ── */}
      <div className="flex h-11 items-center justify-center rounded-lg border border-dashed border-white/[0.08] font-mono text-[10px] tracking-[0.3em] text-zinc-700">
        ■ AD SPACE / SPONSOR ■
      </div>

      {/* ── Table card ── */}
      <section className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${card}`}>
        <div className="flex flex-none flex-wrap gap-2 px-5 pb-3 pt-4">
          {CATEGORIES.map((c) => {
            const active = tab === c.id;
            const count = base.filter((e) => inTab(e, c.id)).length;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { setTab(c.id); setSort("default"); }}
                className={`flex flex-none items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-[11.5px] font-bold tracking-[0.06em] transition-colors ${
                  active ? "bg-red-500/[0.12] text-red-400 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.35)]" : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200"
                }`}
              >
                <span className="text-[11px]">{c.icon}</span>
                {c.label}
                <span className={`text-[10px] font-medium ${active ? "text-red-400/70" : "text-zinc-600"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Sub-categories of the active tab */}
        {subs.length > 0 && (
          <div className="flex flex-none flex-wrap items-center gap-1.5 px-5 pb-3">
            <span className="mr-1 font-mono text-[11px] text-zinc-600">└</span>
            {[{ id: "all", label: `ALL ${tabLabel}`, tickers: [] as string[] }, ...subs].map((sc) => {
              const on = sub === sc.id;
              const count = sc.id === "all" ? base.filter((e) => inTab(e, tab)).length : base.filter((e) => sc.tickers.includes(e.ticker)).length;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => setSub(sc.id)}
                  className={`flex flex-none items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10.5px] font-bold tracking-[0.05em] transition-colors ${
                    on ? "bg-red-500/[0.14] text-zinc-100 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.25)]" : "bg-white/[0.035] text-zinc-500 hover:bg-white/[0.07] hover:text-zinc-200"
                  }`}
                >
                  {sc.label}
                  <span className={`text-[9.5px] font-medium ${on ? "text-red-400/80" : "text-zinc-600"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto px-5">
          <table className="w-full min-w-[760px] border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-[#0a0a0c]">
              <tr className="text-left">
                <th className={`${th} w-[42%]`}>FUND</th>
                <th className={`${th} w-[20%]`}>SECTOR</th>
                {sortTh("aum", "AUM")}
                {sortTh("ytd", "YTD")}
                {sortTh("chg1d", "1D CHG")}
                <th className={`${th} w-16 text-right`}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.ticker} onClick={() => router.push(`/etf/${e.ticker}`)} className="group cursor-pointer">
                  <td className="rounded-l-xl px-3 py-[9px] transition-colors group-hover:bg-white/[0.03]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[14px] font-bold text-zinc-50">{e.ticker}</span>
                      {e.leverage !== "1x" && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-px font-mono text-[9.5px] font-bold text-amber-400">
                          {e.leverage === "Inverse" ? "-3X" : e.leverage.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-zinc-500">{e.name}</div>
                  </td>
                  <td className="px-3 py-[9px] transition-colors group-hover:bg-white/[0.03]">
                    <span className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.06em] text-zinc-400">
                      <span className="w-4 text-center text-[12px]">{e.sectorIcon}</span>
                      {e.sector}
                    </span>
                  </td>
                  <td className="px-3 py-[9px] text-right font-mono text-[12.5px] tabular-nums text-zinc-300 transition-colors group-hover:bg-white/[0.03]">{fmtAum(e.aum)}</td>
                  <td className="px-3 py-[9px] text-right transition-colors group-hover:bg-white/[0.03]"><PctBadge v={e.ytd} /></td>
                  <td className="px-3 py-[9px] text-right transition-colors group-hover:bg-white/[0.03]"><PctBadge v={e.chg1d} /></td>
                  <td className="rounded-r-xl px-3 py-[9px] text-right transition-colors group-hover:bg-white/[0.03]">
                    <Link
                      href={`/chat?etf=${e.ticker}`}
                      onClick={(ev) => ev.stopPropagation()}
                      title={`Zapytaj AI o ${e.ticker}`}
                      className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.04] text-red-500 transition-colors hover:bg-red-500/15"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                        <circle cx="11" cy="11" r="7" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="p-12 text-center text-[13px] text-zinc-500">No ETFs match the current filters.</div>}
        </div>

        <div className="flex flex-none flex-wrap items-center gap-5 border-t border-white/[0.04] bg-white/[0.015] px-6 py-3 font-mono text-[11px] tracking-[0.08em]">
          <span className="text-zinc-500">TOTAL: <span className="text-zinc-300">{rows.length} MATCHES</span></span>
          <span className="text-zinc-600">Σ AUM <span className="text-zinc-300">${totalAum.toFixed(0)}B</span></span>
          <span className="text-zinc-600">AVG YTD <span className={avgYtd >= 0 ? "text-emerald-400" : "text-rose-400"}>{fmtPct(avgYtd)}</span></span>
        </div>
      </section>
    </div>
  );
}
