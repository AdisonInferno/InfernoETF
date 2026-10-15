"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, ETFS, SUBCATEGORIES, fmtAum, fmtPct, inCategory, type CategoryId, type EtfRow } from "@/lib/etfs";
import { QUOTE } from "@/lib/fund-profiles";
import { buildFund } from "@/components/deep-view/buildFund";
import TradingChart from "@/components/deep-view/TradingChart";
import MarketPulse from "@/components/MarketPulse";
import RecentTickers from "@/components/RecentTickers";

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
type SortKey = "default" | "aum" | "ytd" | "chg1d" | "wk";

const PRESETS: { icon: string; label: string; tab: TabId; filters: Filters; sort: SortKey }[] = [
  { icon: "", label: "AI & High Growth", tab: "ai-tech", filters: {}, sort: "ytd" },
  { icon: "", label: "Low Volatility / Defensive", tab: "all", filters: { volatility: ["Low"] }, sort: "aum" },
  { icon: "", label: "High Dividend Yield", tab: "all", filters: { dividend: ["High yield (> 3%)"] }, sort: "aum" },
];

/* ───────────────────────────── UI pieces ───────────────────────────── */

function GroupIcon({ id }: { id: GroupId }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-zinc-500">
      <path d={ICON_PATHS[id]} />
    </svg>
  );
}

function PctBadge({ v, arrow }: { v: number; arrow?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-[2px] font-mono text-[11.5px] font-bold tabular-nums ${v >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
      {arrow && <span className="text-[9px] leading-none">{v > 0 ? "▲" : v < 0 ? "▼" : "■"}</span>}
      {fmtPct(v)}
    </span>
  );
}

/* ── 7D path: cumulative % change over the last 7 sessions (illustrative, seeded by ticker; ends on today's move) ── */
function week(e: EtfRow): number[] {
  let h = 0;
  for (const ch of e.ticker) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
  const vol = (e.volatility === "High" ? 1.9 : e.volatility === "Medium" ? 1.1 : 0.6) * (e.leverage === "1x" ? 1 : 2.4);
  const drift = e.ytd / 200; // YTD trend nudges the week's direction
  const daily = Array.from({ length: 6 }, () => (rnd() - 0.5) * vol + drift);
  daily.push(e.chg1d);
  const pts = [0];
  daily.forEach((d) => pts.push(((1 + pts[pts.length - 1] / 100) * (1 + d / 100) - 1) * 100));
  return pts; // 8 points: start of window → today
}
const wk = (e: EtfRow) => { const p = week(e); return p[p.length - 1]; };

function Spark({ pts, w = 72, h = 22 }: { pts: number[]; w?: number; h?: number }) {
  const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), rg = hi - lo || 1;
  const x = (i: number) => (i / (pts.length - 1)) * w, y = (v: number) => h - 2 - ((v - lo) / rg) * (h - 4);
  const up = pts[pts.length - 1] >= 0, c = up ? "#34d399" : "#fb7185";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
      <line x1="0" x2={w} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.12)" strokeDasharray="2 2" />
      <polyline points={pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} fill="none" stroke={c} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

const card = "rounded-sm border border-white/[0.06] bg-[#0a0a0c]";

type Mode = "price" | "charts";
/** Which half of the Charts view is tucked away */
type Hidden = "none" | "chart" | "list";

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 8 12" className="h-2.5 w-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "right" ? "M2 2l4 4-4 4" : "M6 2L2 6l4 4"} />
    </svg>
  );
}

/** Slim tab stuck to the divider — hides / reveals one half of the split view. */
function EdgeTab({ side, dir, label, onClick }: { side: "left" | "right"; dir: "left" | "right"; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`absolute top-1/2 z-20 flex h-11 w-3.5 -translate-y-1/2 items-center justify-center border border-white/[0.08] bg-[#141418] text-zinc-400 transition-colors hover:border-red-500/40 hover:bg-red-500/[0.12] hover:text-red-300 ${
        side === "left" ? "right-full rounded-l-sm border-r-0" : "left-full rounded-r-sm border-l-0"
      }`}
    >
      <Chevron dir={dir} />
    </button>
  );
}

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
  const [mode, setMode] = useState<Mode>("price");
  const [hidden, setHidden] = useState<Hidden>("none");
  const [sel, setSel] = useState<string | null>(null);

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
      wk: (a, b) => wk(b) - wk(a),
    };
    return [...list].sort(by[sort]);
  }, [base, tab, sort, activeSub]);

  // Charts view: the clicked ETF (falls back to the first row when filters drop it)
  const selected = rows.find((e) => e.ticker === sel) ?? rows[0] ?? null;
  const fund = useMemo(() => (selected ? buildFund(selected.ticker) : null), [selected]);
  const pick = (t: string) => { setSel(t); if (hidden === "chart") setHidden("none"); };
  // Clicking a fund opens the CHARTS view (chart + note + top holdings, list on the right); Deep View is one click further.
  const openRow = (t: string) => { setSel(t); setHidden("none"); setMode("charts"); };


  /* Column rhythm: every data column has the same gap G before it; FUND → SECTOR gets 1.3 × G. */
  const th = "pb-2 pt-1 text-[9.5px] font-semibold tracking-[0.14em] text-zinc-500";
  const gap = "pl-5"; // G = 20px
  const gapFirst = "pl-[26px]"; // 1.3 × G
  const sortTh = (key: SortKey, label: string) => (
    <th className={`${th} ${gap} text-right`}>
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

  const fullTable = (
    <>
      <table className="w-full min-w-[818px] table-fixed border-separate border-spacing-0">
            <colgroup>
              {/* base widths + an equal share of any extra width → gaps grow evenly, FUND→SECTOR stays tight */}
              {[250, 132, 86, 96, 104, 150].map((w, i) => (
                <col key={i} style={{ width: `calc(${w}px + (100% - 818px) / 6)` }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-[#0a0a0c]">
              <tr className="text-left">
                <th className={`${th} pl-2`}>FUND</th>
                <th className={`${th} ${gapFirst} text-right`}>SECTOR</th>
                {sortTh("aum", "AUM")}
                {sortTh("ytd", "YTD")}
                {sortTh("chg1d", "1D CHG")}
                {sortTh("wk", "7D")}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e.ticker}
                  onClick={() => openRow(e.ticker)}
                  className={`group cursor-pointer ${mode === "charts" && selected?.ticker === e.ticker ? "[&>td]:bg-red-500/[0.06]" : ""}`}
                >
                  <td className="rounded-l-sm py-[8px] pl-2.5 transition-colors group-hover:bg-white/[0.03]">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-[14px] font-bold text-zinc-50">{e.ticker}</span>
                      {e.leverage !== "1x" && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-px font-mono text-[9.5px] font-bold text-amber-400">
                          {e.leverage === "Inverse" ? "-3X" : e.leverage.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11.5px] leading-snug text-zinc-500" title={e.name}>{e.name}</div>
                  </td>
                  <td className={`${gapFirst} py-[8px] text-right transition-colors group-hover:bg-white/[0.03]`}>
                    <span className="block truncate font-mono text-[10.5px] font-semibold tracking-[0.06em] text-zinc-400">{e.sector}</span>
                  </td>
                  <td className={`${gap} py-[8px] text-right font-mono text-[12px] tabular-nums text-zinc-300 transition-colors group-hover:bg-white/[0.03]`}>{fmtAum(e.aum)}</td>
                  <td className={`${gap} py-[8px] text-right transition-colors group-hover:bg-white/[0.03]`}><PctBadge v={e.ytd} /></td>
                  <td className={`${gap} py-[8px] text-right transition-colors group-hover:bg-white/[0.03]`}><PctBadge v={e.chg1d} arrow /></td>
                  <td className={`${gap} rounded-r-sm py-[8px] pr-2 transition-colors group-hover:bg-white/[0.03]`}>
                    {(() => { const p = week(e), w = p[p.length - 1]; return (
                      <span className="flex items-center justify-end gap-1.5">
                        <Spark pts={p} w={84} h={28} />
                        <span className={`w-[50px] text-right font-mono text-[11px] font-bold tabular-nums ${w >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(w)}</span>
                      </span>
                    ); })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      {rows.length === 0 && <div className="p-12 text-center text-[13px] text-zinc-500">No ETFs match the current filters.</div>}
    </>
  );

  return (
    <div className={`absolute inset-0 grid grid-rows-[auto_minmax(0,1fr)] gap-3 p-3 max-lg:grid-cols-1 ${
      mode === "price" ? "grid-cols-[240px_minmax(0,1fr)_380px] min-[1900px]:grid-cols-[260px_minmax(0,1fr)_440px]" : "grid-cols-[240px_minmax(0,1fr)]"
    }`}>
      {/* ── Filter deck ── */}
      <aside className={`row-span-2 flex min-h-0 flex-col overflow-hidden ${card} max-lg:row-span-1`}>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
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
                    className="flex w-full items-center gap-2.5 rounded-sm py-[7px] text-left transition-colors hover:text-white"
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
                            className={`rounded-sm border px-2 py-1 text-[11px] transition-colors ${
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

          {/* Only shown while something is filtered */}
          {filterCount > 0 && (
          <div className="mt-5 flex flex-col gap-2">
            <span className="text-[10px] font-semibold tracking-[0.14em] text-zinc-500">ACTIVE FILTERS</span>
              <div className="flex flex-wrap gap-1.5">
                {query && (
                  <button type="button" onClick={() => router.replace("/scanner")} className="rounded-sm bg-white/[0.06] px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/10">
                    Search: {query} ✕
                  </button>
                )}
                {activeChips.map(({ g, o }) => (
                  <button key={g + o} type="button" onClick={() => toggleOpt(g, o)} className="rounded-sm bg-white/[0.06] px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/10">
                    {o} ✕
                  </button>
                ))}
              </div>
          </div>
          )}

          <div className="mt-auto flex flex-col gap-2 pt-6">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setTab(p.tab); setFilters(p.filters); setSort(p.sort); if (query) router.replace("/scanner"); }}
                className="flex items-center gap-3 rounded-sm bg-white/[0.035] px-3.5 py-2.5 text-left text-[12px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white"
              >
                [ {p.label.toUpperCase()} ]
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-none items-center justify-between border-t border-white/[0.06] bg-white/[0.015] px-5 py-3">
          <span className="font-mono text-[10.5px] tracking-[0.12em] text-zinc-600">
            {filterCount === 0 ? "" : `${filterCount} FILTER${filterCount > 1 ? "S" : ""}`}
          </span>
          <button type="button" onClick={clearAll} className="rounded-none bg-white/[0.06] px-3.5 py-1 font-mono text-[10.5px] font-bold tracking-[0.1em] text-zinc-300 transition-colors hover:bg-white/[0.12] hover:text-white">
            CLEAR
          </button>
        </div>
      </aside>

      {/* ── Ad slot ── */}
      <div className="flex h-11 items-center justify-center rounded-sm border border-dashed border-white/[0.08] font-mono text-[10px] tracking-[0.3em] text-zinc-700">
        ■ AD SPACE / SPONSOR ■
      </div>

      {/* ── Market pulse (price view): most active · movers · news ── */}
      {mode === "price" && (
        <div className="row-span-2 row-start-1 flex min-h-0 flex-col max-lg:row-auto max-lg:max-h-[640px] lg:col-start-3">
          <MarketPulse rows={rows} />
        </div>
      )}

      {/* ── Table card ── */}
      <section className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${card}`}>
        <div className="flex flex-none flex-wrap items-center gap-2 px-4 pb-2.5 pt-3 [contain:inline-size]">
          <div role="tablist" aria-label="View" className="flex flex-none items-center rounded-sm border border-white/[0.06] bg-[#030303] p-0.5">
            {(["price", "charts"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => { setMode(m); setHidden("none"); }}
                className={`h-7 rounded-sm px-3 font-mono text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
                  mode === m ? "bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="mx-1 h-5 w-px flex-none bg-white/[0.06]" />
          {CATEGORIES.map((c) => {
            const active = tab === c.id;
            const count = base.filter((e) => inTab(e, c.id)).length;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { setTab(c.id); setSort("default"); }}
                className={`flex flex-none items-center gap-2 rounded-none px-3.5 py-1.5 font-mono text-[11.5px] font-bold tracking-[0.06em] transition-colors ${
                  active ? "bg-red-500/[0.12] text-red-400 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.35)]" : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200"
                }`}
              >
                {c.label}
                <span className={`text-[10px] font-medium ${active ? "text-red-400/70" : "text-zinc-600"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Sub-categories of the active tab */}
        {subs.length > 0 && (
          <div className="flex flex-none flex-wrap items-center gap-1.5 px-4 pb-2.5 [contain:inline-size]">
            <span className="mr-1 font-mono text-[11px] text-zinc-600">└</span>
            {[{ id: "all", label: `ALL ${tabLabel}`, tickers: [] as string[] }, ...subs].map((sc) => {
              const on = sub === sc.id;
              const count = sc.id === "all" ? base.filter((e) => inTab(e, tab)).length : base.filter((e) => sc.tickers.includes(e.ticker)).length;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => setSub(sc.id)}
                  className={`flex flex-none items-center gap-1.5 rounded-none px-3 py-1 font-mono text-[10.5px] font-bold tracking-[0.05em] transition-colors ${
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

        {mode === "price" ? (
          <div className="min-h-0 flex-1 overflow-auto px-3">{fullTable}</div>
        ) : (
          <div className="flex min-h-0 flex-1 px-5 pb-4 max-lg:flex-col max-lg:gap-4 max-lg:overflow-y-auto">
            {/* ── Chart of the clicked ETF ── */}
            {hidden !== "chart" && (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 pr-3.5 max-lg:min-h-[480px] max-lg:pr-0">
                {selected && (
                  <div className="flex flex-none items-baseline gap-3 font-mono">
                    <span className="text-[15px] font-bold text-zinc-50">{selected.ticker}</span>
                    <span className="truncate text-[11.5px] text-zinc-500">{selected.name}</span>
                    <Link href={`/etf/${selected.ticker}`} className="ml-auto flex-none text-[10.5px] font-bold tracking-[0.12em] text-zinc-500 transition-colors hover:text-white">
                      [ DEEP VIEW → ]
                    </Link>
                  </div>
                )}
                {selected && fund && (
                  <div className="grid flex-none grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3 rounded-sm border border-white/[0.06] bg-[#030303] px-3 py-2 font-mono max-xl:grid-cols-1">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-[9.5px] font-semibold tracking-[0.14em] text-zinc-600">WHAT IT IS</span>
                      <p className="m-0 font-sans text-[12px] leading-snug text-zinc-300">
                        {selected.issuer} fund tracking <span className="text-zinc-100">{selected.sector.toLowerCase()}</span> · {fund.positions} positions ·
                        AUM ${selected.aum >= 100 ? selected.aum.toFixed(0) : selected.aum.toFixed(1)}B · TER {fund.ter.toFixed(2)}% ·
                        {selected.dividendYield ? ` yield ${selected.dividendYield.toFixed(1)}%` : " accumulating"} · {selected.volatility.toLowerCase()} volatility
                        {selected.leverage !== "1x" ? ` · ${selected.leverage} leveraged — daily reset, not for buy & hold` : ""}.
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-[9.5px] font-semibold tracking-[0.14em] text-zinc-600">TOP 5 HOLDINGS</span>
                      {fund.holdings.slice(0, 5).map((h) => (
                        <div key={h.tic} className="grid grid-cols-[52px_minmax(0,1fr)_44px] items-center gap-2 text-[11px] tabular-nums">
                          <span className="font-bold text-zinc-100">{h.tic}</span>
                          <span className="relative h-[6px] bg-white/[0.04]"><span className="absolute inset-y-0 left-0 bg-red-500/60" style={{ width: `${Math.min(100, (h.w / Math.max(1, fund.holdings[0].w)) * 100)}%` }} /></span>
                          <span className="text-right text-zinc-300">{h.w.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* TradingChart has a fixed height in Deep View — stretch it to fill the pane here */}
                <div className="min-h-0 flex-1 [&>div]:h-full!">
                  {fund ? (
                    <TradingChart key={fund.tic} fund={fund} />
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-sm border border-white/[0.06] font-mono text-[11px] tracking-[0.1em] text-zinc-600">
                      {selected ? `NO CHART DATA FOR ${selected.ticker}` : "NO ETF SELECTED"}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Divider with hide / show tabs ── */}
            <div className="relative w-px flex-none bg-white/[0.06] max-lg:hidden">
              {hidden === "none" && <EdgeTab side="left" dir="right" label="Hide list" onClick={() => setHidden("list")} />}
              {hidden === "none" && <EdgeTab side="right" dir="left" label="Hide chart" onClick={() => setHidden("chart")} />}
              {hidden === "list" && <EdgeTab side="left" dir="left" label="Show list" onClick={() => setHidden("none")} />}
              {hidden === "chart" && <EdgeTab side="right" dir="right" label="Show chart" onClick={() => setHidden("none")} />}
            </div>

            {/* ── List (compact) or the full table when the chart is hidden ── */}
            {hidden === "chart" ? (
              <div className="min-h-0 min-w-0 flex-1 overflow-auto pl-3.5">{fullTable}</div>
            ) : hidden === "none" ? (
              <div className="flex min-h-0 w-[36%] min-w-[320px] max-w-[480px] flex-none flex-col pl-3.5 max-lg:w-full max-lg:max-w-none max-lg:pl-0">
                <div className="flex flex-none items-center justify-between pb-2 font-mono text-[10px] font-semibold tracking-[0.14em] text-zinc-500">
                  <span>LIST · {activeSub ? activeSub.label : tabLabel}</span>
                  <span className="text-zinc-600">{rows.length}</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-white/[0.06]">
                  {rows.map((e) => {
                    const on = selected?.ticker === e.ticker;
                    const px = QUOTE[e.ticker]?.[0];
                    return (
                      <button
                        key={e.ticker}
                        type="button"
                        onClick={() => pick(e.ticker)}
                        aria-current={on}
                        className={`flex w-full items-center gap-3 border-b border-white/[0.04] px-3 py-2 text-left transition-colors last:border-b-0 ${
                          on ? "bg-red-500/[0.07] shadow-[inset_2px_0_0_#ef4444]" : "hover:bg-white/[0.03]"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[12.5px] font-bold text-zinc-50">{e.ticker}</span>
                            {e.leverage !== "1x" && (
                              <span className="rounded-sm bg-amber-500/15 px-1 font-mono text-[9px] font-bold text-amber-400">{e.leverage === "Inverse" ? "-3X" : e.leverage.toUpperCase()}</span>
                            )}
                          </div>
                          <div className="truncate text-[10.5px] text-zinc-500">{e.name}</div>
                        </div>
                        <span className="flex-none max-xl:hidden"><Spark pts={week(e)} w={48} h={18} /></span>
                        <div className="w-[72px] flex-none text-right font-mono tabular-nums">
                          <div className={`text-[12px] ${on ? "text-white" : "text-zinc-300"}`}>{px != null ? `$${px.toFixed(2)}` : "—"}</div>
                          <div className={`text-[10.5px] font-bold ${e.chg1d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {e.chg1d > 0 ? "▲" : e.chg1d < 0 ? "▼" : "■"} {fmtPct(e.chg1d)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {rows.length === 0 && <div className="p-8 text-center text-[12px] text-zinc-500">No ETFs match the current filters.</div>}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Footer glued to the table: terminal history, full table width */}
        <div className="flex-none border-t border-white/[0.06] bg-white/[0.015] px-2 py-1.5 [contain:inline-size]">
          <RecentTickers />
        </div>
      </section>
    </div>
  );
}
