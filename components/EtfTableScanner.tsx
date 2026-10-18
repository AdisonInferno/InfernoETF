"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, ETFS, SUBCATEGORIES, fmtAum, fmtPct, inCategory, type CategoryId, type EtfRow } from "@/lib/etfs";
import { QUOTE } from "@/lib/fund-profiles";
import { buildFund } from "@/components/deep-view/buildFund";
import EtfDeepDiveCockpit from "@/components/EtfDeepDiveCockpit";
import InfernoChart from "@/components/InfernoChart";
import { useMyPortfolio } from "@/lib/my-portfolio";
import { useLiveEtfs } from "@/lib/market-snapshot";
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

/** Filter Deck sections — every filter above, grouped by what it is about (order = display order). */
const SECTIONS: { label: string; ids: GroupId[] }[] = [
  { label: "FUND & MARKET", ids: ["aum", "issuer", "exchange", "currency"] },
  { label: "EXPOSURE", ids: ["region"] },
  { label: "INCOME & RISK", ids: ["dividend", "volatility", "leverage"] },
];
/** short names for the active-filter chips ("AUM: > $100B ×") */
const CHIP_LABEL: Record<GroupId, string> = { aum: "AUM", volatility: "Volatility", dividend: "Dividend", leverage: "Leverage", issuer: "Issuer", region: "Region", exchange: "Exchange", currency: "Currency" };
const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<GroupId, (typeof GROUPS)[number]>;

type TabId = (typeof CATEGORIES)[number]["id"] | "portfolio";
type SortKey = "default" | "aum" | "ytd" | "chg1d" | "wk";

const PRESETS: { icon: string; label: string; tab: TabId; filters: Filters; sort: SortKey }[] = [
  { icon: "", label: "AI & High Growth", tab: "ai-tech", filters: {}, sort: "ytd" },
  { icon: "", label: "Low Volatility / Defensive", tab: "all", filters: { volatility: ["Low"] }, sort: "aum" },
  { icon: "", label: "High Dividend Yield", tab: "all", filters: { dividend: ["High yield (> 3%)"] }, sort: "aum" },
];

/* ───────────────────────────── UI pieces ───────────────────────────── */

/** Exchange + currency of a stock from its XTB-style suffix ("BDX.PL" → GPW / PLN) */
const LISTING: Record<string, [string, string]> = { PL: ["GPW", "PLN"], DE: ["XETRA", "EUR"], UK: ["LSE", "GBP"], NL: ["EURONEXT", "EUR"], FR: ["EURONEXT", "EUR"], IT: ["BORSA IT.", "EUR"], ES: ["BME", "EUR"], CH: ["SIX", "CHF"], BE: ["EURONEXT", "EUR"], DK: ["NASDAQ CPH", "DKK"], SE: ["NASDAQ STO", "SEK"], NO: ["OSLO", "NOK"], FI: ["NASDAQ HEL", "EUR"], CZ: ["PSE", "CZK"], AT: ["VIENNA", "EUR"], PT: ["EURONEXT", "EUR"], IE: ["EURONEXT", "EUR"] };
function listingOf(t: string): { exchange: string; currency: EtfRow["currency"] } {
  const m = /\.([A-Z]{2})$/.exec(t);
  const [exchange, currency] = (m && LISTING[m[1]]) || ["NYSE / NASDAQ", "USD"];
  return { exchange, currency: currency as EtfRow["currency"] };
}

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

const card = "oasis-glass border border-white/[0.06] bg-[var(--oasis-panel)]";

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
      className={`absolute top-1/2 z-20 flex h-11 w-3.5 -translate-y-1/2 items-center justify-center border border-white/[0.08] bg-[var(--oasis-panel)] text-zinc-400 transition-colors hover:border-red-500/40 hover:bg-red-500/[0.12] hover:text-red-300 ${
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
  /** 1 = as defined (largest first ↓), -1 = flipped (smallest / biggest drop first ↑) */
  const [sortDir, setSortDir] = useState<1 | -1>(1);
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
    setSort("default"); setSortDir(1);
    if (query) router.replace("/scanner");
  };

  /* Today's real 1D / YTD from Yahoo over the static database */
  const { etfs: LIVE_ETFS } = useLiveEtfs();

  /* My portfolio as its own tab: ETFs from the database + single stocks as extra rows */
  const mine = useMyPortfolio();
  const mineW = useMemo<Record<string, number>>(() => Object.fromEntries(mine.map((p) => [p.asset.ticker, p.weight])), [mine]);
  const stockRows = useMemo<EtfRow[]>(() => mine.filter((p) => !ETFS.some((e) => e.ticker === p.asset.ticker)).map(({ asset: a }) => ({
    ticker: a.ticker, name: a.name, issuer: "Stock", category: "others", sector: a.sector.toUpperCase(), sectorIcon: "",
    aum: NaN, ytd: a.ytd, chg1d: a.chg1d, volatility: "High", dividendYield: 0, leverage: "1x", region: "", ...listingOf(a.ticker),
  }) as EtfRow), [mine]);
  const stockSet = useMemo(() => new Set(stockRows.map((r) => r.ticker)), [stockRows]);

  // Filters + search, before the category tab is applied (tab counts come from this).
  const base = useMemo(() => {
    const s = query.toLowerCase();
    return [...LIVE_ETFS, ...stockRows].filter(
      (e) =>
        (!s || e.ticker.toLowerCase().includes(s) || e.name.toLowerCase().includes(s)) &&
        GROUPS.every((g) => {
          const sel = filters[g.id];
          return !sel?.length || sel.some((o) => g.test(e, o));
        })
    );
  }, [filters, query, stockRows, LIVE_ETFS]);

  const inTab = (e: EtfRow, t: TabId) =>
    t === "portfolio" ? e.ticker in mineW
    : stockSet.has(e.ticker) ? false // single stocks only live in the portfolio tab
    : t === "all" ? true : t === "trending" ? e.trending !== undefined : inCategory(e, t);
  const subs = tab === "all" || tab === "trending" || tab === "portfolio" ? [] : (SUBCATEGORIES[tab as CategoryId] ?? []);
  const activeSub = subs.find((s) => s.id === sub);
  const tabLabel = tab === "portfolio" ? "MY PORTFOLIO" : CATEGORIES.find((c) => c.id === tab)?.label ?? "";

  const rows = useMemo(() => {
    const list = base.filter((e) => inTab(e, tab) && (!activeSub || activeSub.tickers.includes(e.ticker)));
    const by: Record<SortKey, (a: EtfRow, b: EtfRow) => number> = {
      default: tab === "portfolio" ? (a, b) => (mineW[b.ticker] ?? 0) - (mineW[a.ticker] ?? 0)
        : tab === "trending" ? (a, b) => (a.trending ?? 99) - (b.trending ?? 99) : (a, b) => b.aum - a.aum,
      aum: (a, b) => (Number.isFinite(b.aum) ? b.aum : -1) - (Number.isFinite(a.aum) ? a.aum : -1),
      ytd: (a, b) => b.ytd - a.ytd,
      chg1d: (a, b) => b.chg1d - a.chg1d,
      wk: (a, b) => wk(b) - wk(a),
    };
    return [...list].sort((a, b) => by[sort](a, b) * sortDir);
  }, [base, tab, sort, sortDir, activeSub, mineW, stockSet]);

  // Charts view: the clicked ETF (falls back to the first row when filters drop it)
  const selected = rows.find((e) => e.ticker === sel) ?? rows[0] ?? null;
  const fund = useMemo(() => (selected ? buildFund(selected.ticker) : null), [selected]);
  const pick = (t: string) => { setSel(t); if (hidden === "chart") setHidden("none"); };
  // Clicking a fund opens the CHARTS view (chart + note + top holdings, list on the right); Deep View is one click further.
  // single stocks (portfolio tab) open the stock deep dive; ETFs open the CHARTS cockpit
  const openRow = (t: string) => { if (stockSet.has(t)) { router.push(`/stock/${t}`); return; } setSel(t); setHidden("none"); setMode("charts"); };


  /* Column rhythm: every data column has the same gap G before it; FUND → SECTOR gets 1.3 × G. */
  const th = "pb-2 pt-1 text-[9.5px] font-semibold tracking-[0.14em] text-zinc-500";
  const gap = "pl-5"; // G = 20px
  const gapFirst = "pl-[26px]"; // 1.3 × G
  const sortTh = (key: SortKey, label: string) => (
    <th className={`${th} ${gap} text-right`}>
      <button
        type="button"
        onClick={() => { if (sort === key) setSortDir((d) => (d === 1 ? -1 : 1)); else { setSort(key); setSortDir(1); } }}
        title="Click again to flip the order"
        className={`tracking-[0.14em] transition-colors hover:text-white ${sort === key ? "text-white" : ""}`}
      >
        {label}
        {sort === key ? (sortDir === 1 ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );

  const fullTable = (
    <>
      <table className="w-full min-w-[958px] table-fixed border-separate border-spacing-0">
            <colgroup>
              {/* base widths + an equal share of any extra width → gaps grow evenly, FUND→SECTOR stays tight */}
              {[250, 132, 58, 82, 86, 96, 104, 150].map((w, i) => (
                <col key={i} style={{ width: `calc(${w}px + (100% - 958px) / 8)` }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-[var(--oasis-panel)]">
              <tr className="text-left">
                <th className={`${th} pl-2`}>FUND</th>
                <th className={`${th} ${gapFirst} text-right`}>SECTOR</th>
                <th className={`${th} ${gap} text-right`}>CCY</th>
                <th className={`${th} ${gap} text-right`} title="Exchange the fund is listed on">EXCHANGE</th>
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
                      {mineW[e.ticker] != null && (
                        <span className="rounded-sm bg-emerald-400/10 px-1.5 py-px font-mono text-[9.5px] font-bold text-emerald-300" title="Weight in your portfolio">★ {mineW[e.ticker]}%</span>
                      )}
                      {stockSet.has(e.ticker) && <span className="rounded-sm bg-white/[0.06] px-1.5 py-px font-mono text-[9px] font-bold tracking-[0.1em] text-zinc-400">STOCK</span>}
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
                  <td className={`${gap} py-[8px] text-right font-mono text-[11px] font-semibold text-zinc-300 transition-colors group-hover:bg-white/[0.03]`}>{e.currency || "—"}</td>
                  <td className={`${gap} py-[8px] text-right transition-colors group-hover:bg-white/[0.03]`}>
                    <span className="block truncate font-mono text-[10.5px] tracking-[0.04em] text-zinc-400" title={e.exchange}>{(e.exchange || "—").toUpperCase()}</span>
                  </td>
                  <td className={`${gap} py-[8px] text-right font-mono text-[12px] tabular-nums text-zinc-300 transition-colors group-hover:bg-white/[0.03]`}>{Number.isFinite(e.aum) ? fmtAum(e.aum) : <span className="text-zinc-600">—</span>}</td>
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
      {rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 p-12 text-center text-[13px] text-zinc-500">
          No ETFs match the current filters{tab !== "all" ? ` in ${tabLabel}` : ""}.
          {filterCount > 0 && <button type="button" onClick={clearAll} className="font-mono text-[11px] tracking-[0.1em] text-zinc-400 underline-offset-2 hover:text-white hover:underline">CLEAR FILTERS</button>}
        </div>
      )}
    </>
  );

  return (
    <div className={`absolute inset-0 grid grid-rows-[auto_minmax(0,1fr)] gap-3 p-3 max-lg:grid-cols-1 ${
      mode === "price" ? "grid-cols-[240px_minmax(0,1fr)_380px] min-[1900px]:grid-cols-[260px_minmax(0,1fr)_440px]" : "grid-cols-[240px_minmax(0,1fr)]"
    }`}>
      {/* ── Filter deck ── ends after its content (no empty panel); scrolls inside when long */}
      <aside className={`row-span-2 flex min-h-0 flex-col overflow-hidden ${card} max-lg:row-span-1 lg:max-h-full lg:self-start`}>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-3">
          <div className="mb-1 flex items-center gap-2 font-mono text-[12px] font-bold tracking-[0.14em] text-zinc-100">
            <span className="h-2 w-2 rounded-[1px] bg-emerald-400" />[ FILTER DECK ]
          </div>
          {/* matching results — the same rows the table shows (filters + search + the open tab) */}
          <div className="mb-3 font-mono text-[10.5px] tracking-[0.06em] text-zinc-500" aria-live="polite">
            <span className="font-bold text-zinc-100">{rows.length}</span> {rows.length === 1 ? "ETF matches" : "ETFs match"}
            {tab !== "all" && <span className="text-zinc-600"> in {activeSub ? activeSub.label : tabLabel} · {base.filter((e) => !stockSet.has(e.ticker)).length} across all</span>}
          </div>

          {/* Presets: one click = their tab + filters + sort */}
          <div className="mb-3 flex flex-col gap-1.5">
            <span className="text-[9.5px] font-semibold tracking-[0.16em] text-zinc-600">PRESETS</span>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => {
                const on = tab === p.tab && JSON.stringify(filters) === JSON.stringify(p.filters) && sort === p.sort;
                return (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => { setTab(p.tab); setFilters(p.filters); setSort(p.sort); setSortDir(1); if (query) router.replace("/scanner"); }}
                    className={`rounded-sm border px-2 py-1 text-left text-[11px] font-semibold transition-colors ${
                      on ? "oasis-on" : "border-white/[0.06] bg-white/[0.035] text-zinc-300 hover:bg-white/[0.07] hover:text-white"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active filters as removable chips — each × removes exactly that condition */}
          {filterCount > 0 && (
            <div className="mb-3 flex flex-col gap-1.5">
              <span className="flex items-center justify-between text-[9.5px] font-semibold tracking-[0.16em] text-zinc-600">
                ACTIVE FILTERS
                <button type="button" onClick={clearAll} className="font-bold text-zinc-500 hover:text-white">CLEAR ALL</button>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {query && (
                  <button type="button" onClick={() => router.replace("/scanner")} title="Remove search" className="rounded-sm bg-white/[0.06] px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/10">
                    <span className="text-zinc-500">Search:</span> {query} ✕
                  </button>
                )}
                {activeChips.map(({ g, o }) => (
                  <button key={g + o} type="button" onClick={() => toggleOpt(g, o)} title="Remove this filter" className="rounded-sm bg-white/[0.06] px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/10">
                    <span className="text-zinc-500">{CHIP_LABEL[g]}:</span> {o} ✕
                  </button>
                ))}
              </div>
            </div>
          )}

          {SECTIONS.map((sec) => (
            <div key={sec.label} className="mb-2 flex flex-col">
              <span className="mb-0.5 border-b border-white/[0.05] pb-1 text-[9.5px] font-semibold tracking-[0.16em] text-zinc-600">{sec.label}</span>
              {sec.ids.map((id) => {
                const g = GROUP_BY_ID[id];
                const isOpen = !!open[g.id];
                const sel = filters[g.id] ?? [];
                return (
                  <div key={g.id}>
                    <button
                      type="button"
                      onClick={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-2.5 rounded-sm py-[6px] text-left transition-colors hover:text-white"
                    >
                      <span className={`text-[9px] text-oasis transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                      <GroupIcon id={g.id} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-[11.5px] font-semibold tracking-[0.1em] text-zinc-300">{g.label}</span>
                        {/* closed: what is selected, so nothing has to be expanded to see the state */}
                        {!isOpen && sel.length > 0 && <span className="block truncate text-[10.5px] text-oasis" title={sel.join(", ")}>{sel.join(", ")}</span>}
                      </span>
                      {sel.length > 0 && <span className="rounded bg-oasis-muted px-1.5 font-mono text-[10px] font-bold text-oasis" title={`${sel.length} active`}>{sel.length}</span>}
                    </button>
                    {isOpen && (
                      <div className="mb-2 ml-[22px] flex flex-wrap gap-1.5 pt-1">
                        {g.options.map((o) => {
                          const on = sel.includes(o);
                          return (
                            <button
                              key={o}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggleOpt(g.id, o)}
                              className={`rounded-sm border px-2 py-1 text-[11px] transition-colors ${
                                on ? "oasis-on" : "border-white/[0.06] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200"
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
          ))}
        </div>
        <div className="flex flex-none items-center justify-between border-t border-white/[0.06] bg-white/[0.015] px-4 py-2.5">
          <span className="font-mono text-[10.5px] tracking-[0.12em] text-zinc-600">
            {filterCount === 0 ? "NO FILTERS" : `${filterCount} FILTER${filterCount > 1 ? "S" : ""}`}
          </span>
          <button type="button" onClick={clearAll} title="Clear all filters, the search and the sort order" className="rounded-none bg-white/[0.06] px-3.5 py-1 font-mono text-[10.5px] font-bold tracking-[0.1em] text-zinc-300 transition-colors hover:bg-white/[0.12] hover:text-white">
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
          <MarketPulse rows={rows} all={LIVE_ETFS} />
        </div>
      )}

      {/* ── Table card ── */}
      <section className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${card}`}>
        <div className="flex flex-none flex-wrap items-center gap-2 px-4 pb-2.5 pt-3 [contain:inline-size]">
          <div role="tablist" aria-label="View" className="flex flex-none items-center rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] p-0.5">
            {(["price", "charts"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => { setMode(m); setHidden("none"); }}
                className={`h-7 rounded-sm px-3 font-mono text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
                  mode === m ? "oasis-on" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="mx-1 h-5 w-px flex-none bg-white/[0.06]" />
          {mine.length > 0 && (
            <button
              type="button"
              onClick={() => { setTab("portfolio"); setSort("default"); setSortDir(1); }}
              title="Positions from your portfolio"
              className={`flex flex-none items-center gap-2 rounded-none px-3.5 py-1.5 font-mono text-[11.5px] font-bold tracking-[0.06em] transition-colors ${
                tab === "portfolio" ? "oasis-on" : "bg-emerald-400/[0.04] text-emerald-400/80 hover:bg-emerald-400/[0.1] hover:text-emerald-300"
              }`}
            >
              ★ PORTFOLIO
              <span className="text-[10px] font-medium text-emerald-400/60">{base.filter((e) => inTab(e, "portfolio")).length}</span>
            </button>
          )}
          {CATEGORIES.map((c) => {
            const active = tab === c.id;
            const count = base.filter((e) => inTab(e, c.id)).length;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { setTab(c.id); setSort("default"); setSortDir(1); }}
                className={`flex flex-none items-center gap-2 rounded-none px-3.5 py-1.5 font-mono text-[11.5px] font-bold tracking-[0.06em] transition-colors ${
                  active ? "oasis-on" : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200"
                }`}
              >
                {c.label}
                <span className={`text-[10px] font-medium ${active ? "text-white" : "text-zinc-600"}`}>{count}</span>
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
                    on ? "oasis-on" : "bg-white/[0.035] text-zinc-500 hover:bg-white/[0.07] hover:text-zinc-200"
                  }`}
                >
                  {sc.label}
                  <span className={`text-[9.5px] font-medium ${on ? "text-white" : "text-zinc-600"}`}>{count}</span>
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
                {selected && fund ? (
                  <EtfDeepDiveCockpit key={selected.ticker} etf={selected} fund={fund} />
                ) : selected ? (
                  /* no composition profile → no cockpit, but the price history still exists: show that */
                  <div className="flex h-full min-h-0 flex-col gap-2">
                    <div className="flex flex-none flex-wrap items-baseline gap-x-3 gap-y-1 rounded-sm border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-[11px] text-zinc-400">
                      <span className="font-bold text-zinc-100">{selected.ticker}</span>
                      {stockSet.has(selected.ticker) ? (
                        <>
                          <span>Single stock — the ETF cockpit (holdings, composition) doesn&apos;t apply. Price history is shown below.</span>
                          <button type="button" onClick={() => router.push(`/stock/${selected.ticker}`)} className="ml-auto font-bold tracking-[0.08em] text-zinc-200 hover:text-white">STOCK DEEP DIVE →</button>
                        </>
                      ) : (
                        <span>No holdings profile for this fund yet, so composition, holdings and the deep-dive cockpit aren&apos;t available. Price history is shown below.</span>
                      )}
                    </div>
                    <div className="min-h-[360px] flex-1">
                      <InfernoChart key={selected.ticker} main={{ id: selected.ticker, label: selected.ticker, sym: selected.ticker, color: "#f87171" }}
                        pinned={[{ id: "SPY", label: "S&P 500", sym: "SPY", color: "#a1a1aa", dashed: true }].filter((l) => l.sym !== selected.ticker)} />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 rounded-sm border border-white/[0.06] font-mono text-[11px] tracking-[0.1em] text-zinc-600">
                    <span>NO ETF MATCHES THE CURRENT FILTERS</span>
                    {filterCount > 0 && <button type="button" onClick={clearAll} className="text-zinc-400 underline-offset-2 hover:text-white hover:underline">clear filters</button>}
                  </div>
                )}
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
