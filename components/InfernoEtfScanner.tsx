"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ETFS, type EtfRow } from "@/lib/etfs";
import { QUOTE } from "@/lib/fund-profiles";
import { useMyPortfolio } from "@/lib/my-portfolio";
import { useSnapshot } from "@/lib/market-snapshot";
import { SegRail } from "@/components/InfernoChart";
import { periodWindow, rangeFor, useHoldingReturns, usePriceSeries } from "@/components/deep-view/useHoldingReturns";
import { yahooOf } from "@/lib/portfolio-live";
import { currencyOf, formatMarketValue } from "@/lib/format";

/* ─────────────────────────────── Types ─────────────────────────────── */

type Provider = "BlackRock" | "Vanguard" | "State Street" | "Invesco" | "Other";

interface Etf {
  ticker: string;
  name: string;
  provider: Provider;
  /** Assets under management, in $B */
  aum: number;
  /** Yahoo symbol the returns / price are loaded for (index codes and Warsaw tickers differ from the label) */
  sym: string;
  /** 1-day change, in % (static fallback; the map uses the live snapshot) */
  change1d: number;
  price: number;
  note: string;
}

interface Sector {
  title: string;
  etfs: Etf[];
}

interface MacroEtf extends Etf {
  tag: string;
}

type SortKey = "aum" | "chg";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ─────────────────────────── Timeframes ─────────────────────────── */

/** standard timeframe array (MAX is left out: "since inception" returns are not comparable across instruments) */
const TFS = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"] as const;
type TfKey = (typeof TFS)[number];
/** Colour-scale stretch per timeframe (≈ √time): a ±1.5% day is as "loud" as a ±22% year.
 *  Every tile, label, tooltip, sector average and sort reads ONE value per ticker: retOf(etf) for the selected tf. */
const TF_SCALE: Record<TfKey, number> = { "1D": 1, "1W": 2.2, "1M": 4.5, "3M": 7.5, "6M": 10.5, YTD: 13, "1Y": 15, "3Y": 26, "5Y": 34 };
/* ───────────────────────────── Mock data ───────────────────────────── */

/** Map sectors built from the full ETF database (lib/etfs). Order = default tile order. */
const MAP_SECTORS: { title: string; short: string; test: (e: EtfRow) => boolean }[] = [
  { title: "INDEXES", short: "IDX", test: (e) => e.category === "indexes" },
  { title: "TECHNOLOGY", short: "TECH", test: (e) => e.category === "ai-tech" },
  { title: "DEFENSE", short: "DEF", test: (e) => e.category === "defense" },
  { title: "FINANCIALS", short: "FIN", test: (e) => e.category === "financials" },
  { title: "ENERGY", short: "ENRG", test: (e) => e.category === "energy" || e.sector === "UTILITIES" },
  { title: "COMMODITIES", short: "CMDTY", test: (e) => e.category === "commodities" },
  { title: "INDUSTRIALS", short: "IND", test: (e) => e.category === "industry" },
  { title: "HEALTHCARE", short: "HLTH", test: (e) => ["BIG PHARMA", "HEALTHCARE", "BIOTECH"].includes(e.sector) },
  { title: "CONSUMER", short: "CONS", test: (e) => ["CONSUMER", "STAPLES"].includes(e.sector) },
  { title: "CRYPTO", short: "CRYPTO", test: (e) => ["BITCOIN", "ETHEREUM"].includes(e.sector) },
  { title: "BONDS & FX", short: "BND/FX", test: (e) => ["TREASURIES", "US DOLLAR"].includes(e.sector) },
];
const KNOWN: Provider[] = ["BlackRock", "Vanguard", "State Street", "Invesco"];
const toEtf = (e: EtfRow): Etf => ({
  ticker: e.ticker, name: e.name, provider: (KNOWN as string[]).includes(e.issuer) ? (e.issuer as Provider) : "Other",
  sym: e.ticker, aum: e.aum, change1d: e.chg1d, price: QUOTE[e.ticker]?.[0] ?? 0, note: `${e.sector} · ${e.issuer}`,
});
const SECTORS: Sector[] = MAP_SECTORS.map(({ title, test }) => ({
  title,
  etfs: ETFS.filter((e) => e.leverage === "1x" && test(e)).map(toEtf),
})).filter((s) => s.etfs.length);
const SHORT: Record<string, string> = { ...Object.fromEntries(MAP_SECTORS.map((m) => [m.title, m.short])), "MY PORTFOLIO": "★ MINE" };
/** Average sector size ($B) — the portfolio sector is drawn as one average-sized sector, split by your weights */
const AVG_SECTOR_AUM = SECTORS.reduce((s, g) => s + g.etfs.reduce((a, e) => a + e.aum, 0), 0) / SECTORS.length;

/** Yahoo symbols of the country indices (codes without one show N/A instead of a made-up move). */
const IX_YAHOO: Record<string, string> = {
  SPX: "^GSPC", NDX: "^NDX", DJI: "^DJI", N225: "^N225", SHCOMP: "000001.SS", SZCOMP: "399001.SZ",
  HSI: "^HSI", HSCEI: "^HSCE", UKX: "^FTSE", MCX: "^FTMC", DAX: "^GDAXI", MDAX: "^MDAXI", TECDAX: "^TECDAX", CAC: "^FCHI", SBF120: "^SBF120",
  NIFTY: "^NSEI", SENSEX: "^BSESN", BANKNIFTY: "^NSEBANK", KOSPI: "^KS11", KOSDAQ: "^KQ11", TAIEX: "^TWII", TSX: "^GSPTSE",
  SMI: "^SSMI", XJO: "^AXJO", XAO: "^AORD", IBOV: "^BVSP",
  // Yahoo has no Warsaw index series: WIG20 via the Beta ETF WIG20TR (total-return proxy); mWIG40 / sWIG80 have none → N/A
  WIG20: "ETFBW20TR.WA",
};
/* ── COUNTRIES universe: 3 main equity indices per market (static levels/moves are fallbacks; live data via IX_YAHOO).
      aum = approx. market cap of the country's listed equities in $B → drives MKT WEIGHT. ── */
type Ix = [code: string, name: string, level: number, chg1d: number, ytd: number];
const COUNTRIES: { title: string; short: string; capB: number; vol: "Low" | "Medium" | "High"; ix: Ix[] }[] = [
  { title: "UNITED STATES", short: "US", capB: 62000, vol: "Low", ix: [["SPX", "S&P 500", 6680, 0.42, 14.2], ["NDX", "Nasdaq 100", 24480, 0.87, 18.9], ["DJI", "Dow Jones 30", 46350, 0.21, 9.8]] },
  { title: "JAPAN", short: "JP", capB: 6800, vol: "Medium", ix: [["N225", "Nikkei 225", 47900, -0.36, 21.4], ["TOPIX", "TOPIX", 3230, -0.18, 16.1], ["TSEG", "TSE Growth 250", 780, 0.64, 12.7]] },
  { title: "CHINA", short: "CN", capB: 11500, vol: "High", ix: [["SHCOMP", "Shanghai Composite", 3880, 0.52, 15.6], ["CSI300", "CSI 300", 4620, 0.71, 17.3], ["SZCOMP", "Shenzhen Component", 13180, 1.12, 26.4]] },
  { title: "HONG KONG", short: "HK", capB: 4600, vol: "High", ix: [["HSI", "Hang Seng", 25900, -0.84, 28.8], ["HSCEI", "HS China Enterprises", 9240, -0.97, 26.9], ["HSTECH", "Hang Seng Tech", 6050, -1.41, 34.1]] },
  { title: "UNITED KINGDOM", short: "UK", capB: 3300, vol: "Low", ix: [["UKX", "FTSE 100", 9440, 0.31, 15.4], ["MCX", "FTSE 250", 22080, 0.12, 5.2], ["ASX", "FTSE All-Share", 5150, 0.27, 13.8]] },
  { title: "GERMANY", short: "DE", capB: 2500, vol: "Medium", ix: [["DAX", "DAX 40", 24350, 0.45, 22.3], ["MDAX", "MDAX", 30600, -0.22, 19.1], ["TECDAX", "TecDAX", 3720, 0.68, 12.0]] },
  { title: "FRANCE", short: "FR", capB: 3100, vol: "Medium", ix: [["CAC", "CAC 40", 7980, -0.19, 8.1], ["SBF120", "SBF 120", 6150, -0.21, 7.4], ["CACMID", "CAC Mid 60", 15200, -0.43, 6.2]] },
  { title: "INDIA", short: "IN", capB: 5200, vol: "Medium", ix: [["NIFTY", "Nifty 50", 25200, 0.38, 6.6], ["SENSEX", "BSE Sensex", 82300, 0.35, 5.3], ["BANKNIFTY", "Nifty Bank", 56400, 0.61, 11.2]] },
  { title: "SOUTH KOREA", short: "KR", capB: 2300, vol: "High", ix: [["KOSPI", "KOSPI", 3610, 1.24, 50.4], ["KOSDAQ", "KOSDAQ", 860, 0.88, 26.8], ["KS200", "KOSPI 200", 490, 1.36, 55.1]] },
  { title: "TAIWAN", short: "TW", capB: 2900, vol: "High", ix: [["TAIEX", "TAIEX", 26800, 1.58, 16.4], ["TPEX", "TPEx", 270, 0.91, 7.9], ["TW50", "FTSE TWSE Taiwan 50", 24900, 1.72, 19.8]] },
  { title: "CANADA", short: "CA", capB: 3700, vol: "Low", ix: [["TSX", "S&P/TSX Composite", 30100, 0.29, 21.6], ["TSX60", "S&P/TSX 60", 1810, 0.33, 22.2], ["TSXV", "TSX Venture", 860, 0.94, 43.5]] },
  { title: "SWITZERLAND", short: "CH", capB: 2100, vol: "Low", ix: [["SMI", "SMI", 12640, -0.27, 9.0], ["SPI", "Swiss Performance", 17150, -0.24, 10.1], ["SMIM", "SMI Mid", 2780, -0.52, 8.3]] },
  { title: "AUSTRALIA", short: "AU", capB: 1900, vol: "Low", ix: [["XJO", "S&P/ASX 200", 8920, 0.18, 9.3], ["XAO", "All Ordinaries", 9190, 0.21, 10.0], ["XFL", "S&P/ASX 50", 8350, 0.12, 8.1]] },
  { title: "BRAZIL", short: "BR", capB: 900, vol: "High", ix: [["IBOV", "Ibovespa", 143800, -0.63, 19.6], ["IBXX", "IBrX 100", 60200, -0.58, 18.7], ["SMLL", "Small Cap", 2240, -1.05, 25.9]] },
  { title: "POLAND", short: "PL", capB: 250, vol: "Medium", ix: [["WIG20", "WIG20", 2960, 0.74, 35.1], ["MWIG40", "mWIG40", 7550, 0.41, 26.4], ["SWIG80", "sWIG80", 28200, 0.22, 21.0]] },
];
const COUNTRY_SECTORS: Sector[] = COUNTRIES.map((c) => ({
  title: c.title,
  etfs: c.ix.map(([code, name, level, chg1d, ytd], i) => ({
    ticker: code, sym: IX_YAHOO[code] ?? code, name, provider: "Other" as Provider,
    aum: c.capB * [0.55, 0.3, 0.15][i], // index share of the country's weight on the map
    change1d: chg1d, price: level, note: `${c.title} · main equity index${code === "WIG20" ? " · via Beta ETF WIG20TR (total-return proxy, price in PLN)" : IX_YAHOO[code] ? "" : " · no data feed for this index"} · ytd ${ytd}% (static)`,
  })),
}));
const COUNTRY_SHORT: Record<string, string> = Object.fromEntries(COUNTRIES.map((c) => [c.title, c.short]));

const MACRO: MacroEtf[] = ([
  { ticker: "UUP", name: "Invesco DB US Dollar Index Fund", provider: "Invesco", tag: "US Dollar Index", aum: 1.9, change1d: 0.21, price: 29.4, note: "Dollar bid on relative US growth and policy-rate expectations." },
  { ticker: "GLD", name: "SPDR Gold Shares", provider: "State Street", tag: "Gold", aum: 72, change1d: 0.9, price: 243.7, note: "Gold edges up as real yields ease and central-bank buying persists." },
  { ticker: "SLV", name: "iShares Silver Trust", provider: "BlackRock", tag: "Silver", aum: 13, change1d: 1.74, price: 27.6, note: "Silver outpaces gold on industrial demand and solar-sector orders." },
  { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", provider: "State Street", tag: "S&P 500", aum: 580, change1d: 0.42, price: 584.2, note: "Broad tape firm as megacap earnings revisions lift index EPS estimates." },
] as Omit<MacroEtf, "sym">[]).map((m) => ({ ...m, sym: m.ticker }));

const PROVIDERS: Provider[] = ["BlackRock", "Vanguard", "State Street", "Invesco", "Other"];

/* ───────────────────────────── Helpers ─────────────────────────────── */

const SECTOR_GAP = 8; // half-gutter between sector cards
const HEADER_H = 34; // sector card title bar
const MONO = "font-mono";

const fmtPct = (c: number) =>
  (c > 0 ? "+" : c < 0 ? "−" : "") + Math.abs(c).toFixed(2) + "%";

const tileBg = (c: number) => {
  if (c >= 1.5) return "#047857";
  if (c >= 0.5) return "#065f46";
  if (c > 0.15) return "#064e3b";
  if (c >= -0.15) return "#27272a";
  if (c > -0.5) return "#7f1d1d";
  if (c > -1.5) return "#991b1b";
  return "#b91c1c";
};

const trendColor = (c: number) => (c >= 0 ? "#34D399" : "#F87171");

/**
 * Strict binary-split treemap: partitions items at the weight midpoint and
 * splits along the longer axis, recursively. Fills the rect with no gaps.
 */
function layoutTreemap<T extends { wt: number }>(
  items: T[],
  rect: Rect,
  out: Array<Rect & { item: T }> = []
): Array<Rect & { item: T }> {
  const { x, y, w, h } = rect;
  if (!items.length) return out;
  if (items.length === 1) {
    out.push({ item: items[0], x, y, w, h });
    return out;
  }
  const total = items.reduce((s, i) => s + i.wt, 0);
  let acc = 0;
  let k = 1;
  for (let i = 0; i < items.length - 1; i++) {
    acc += items[i].wt;
    k = i + 1;
    if (acc >= total / 2) break;
  }
  const a = items.slice(0, k);
  const b = items.slice(k);
  const ratio = a.reduce((s, i) => s + i.wt, 0) / total;
  if (w >= h) {
    layoutTreemap(a, { x, y, w: w * ratio, h }, out);
    layoutTreemap(b, { x: x + w * ratio, y, w: w * (1 - ratio), h }, out);
  } else {
    layoutTreemap(a, { x, y, w, h: h * ratio }, out);
    layoutTreemap(b, { x, y: y + h * ratio, w, h: h * (1 - ratio) }, out);
  }
  return out;
}

/** Sparkline from the real bars of the selected window (same bars the % is computed from). */
function sparkline(bars: { c: number[] } | null) {
  if (!bars || bars.c.length < 2) return null;
  const pts = bars.c, n = pts.length;
  const mn = Math.min(...pts);
  const rg = Math.max(...pts) - mn || 1;
  const line = pts
    .map((p, i) => `${((i / (n - 1)) * 256).toFixed(1)},${(52 - ((p - mn) / rg) * 46).toFixed(1)}`)
    .join(" ");
  return { line, area: `0,56 ${line} 256,56` };
}

/** Tile colour for a missing return (no price history for this symbol / window) */
const NA_TILE = "repeating-linear-gradient(135deg, #1f1f23 0 6px, #18181b 6px 12px)";
/** map timeframes the ETF deep-view chart can open on directly */
const CHART_TF = new Set(["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"]);

/** Tooltip sparkline: the bars of the selected window for one symbol (shared price cache). */
function TipSpark({ sym, tf, color }: { sym: string; tf: TfKey; color: string }) {
  const px = usePriceSeries([sym], rangeFor(tf));
  const sp = sparkline(periodWindow(px.series[sym.toUpperCase()] ?? null, tf));
  if (!sp) return <div className={`${MONO} flex h-14 items-center text-[10px] tracking-[0.1em] text-zinc-600`}>{px.state === "loading" ? "LOADING…" : "NO PRICE HISTORY FOR THIS WINDOW"}</div>;
  return (
    <svg viewBox="0 0 256 56" width={256} height={56} className="block">
      <polygon points={sp.area} fill={color} fillOpacity={0.08} />
      <polyline points={sp.line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ───────────────────────────── UI pieces ───────────────────────────── */

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[11px] font-semibold tracking-[0.08em] text-zinc-500">{children}</span>
);

const ToggleButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      "flex-1 cursor-pointer rounded-sm border px-1 py-[9px] text-center text-xs font-semibold transition-colors",
      active
        ? "oasis-on"
        : "border-white/[0.06] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.08]",
    ].join(" ")}
  >
    {children}
  </button>
);

/* ───────────────────────────── Component ───────────────────────────── */


export default function InfernoEtfScanner() {
  const router = useRouter();
  const [equalWeight, setEqualWeight] = useState(true);
  const [sort, setSort] = useState<SortKey>("aum");
  /** -1 = largest first (↓), 1 = smallest first (↑); clicking the active sort again flips it */
  const [dir, setDir] = useState<1 | -1>(-1);
  const pickSort = (k: SortKey) => { if (k === sort) setDir((d) => (d === -1 ? 1 : -1)); else { setSort(k); setDir(-1); } };
  const [disabled, setDisabled] = useState<Partial<Record<Provider, boolean>>>({});
  const [hoverSector, setHoverSector] = useState<string | null>(null);
  const [tip, setTip] = useState<{ etf: Etf; x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 960, h: 560 });
  const mapRef = useRef<HTMLDivElement>(null);
  /** Zoom / compare: empty = whole market. Click = zoom into one sector, right-click = add/remove (compare). */
  const [focus, setFocus] = useState<string[]>([]);
  /** Scrubber: the ONLY thing it changes — all timeframes are already inside every Etf.perf */
  const [tf, setTf] = useState<TfKey>("1D");
  /** Map universe: ETFs by sector, or countries by their main indices */
  const [universe, setUniverse] = useState<"ETF" | "COUNTRIES">("ETF");
  /* Your portfolio as its own sector (ETF view): every holding, tile size = its weight in the portfolio */
  const mine = useMyPortfolio();
  const mineSector = useMemo<Sector | null>(() => {
    if (!mine.length) return null;
    return {
      title: "MY PORTFOLIO",
      etfs: mine.map(({ asset: a, weight }) => {
        const row = ETFS.find((e) => e.ticker === a.ticker);
        const base = row ? toEtf(row) : {
          ticker: a.ticker, sym: yahooOf(a.ticker), name: a.name, provider: "Other" as Provider, aum: 0, change1d: a.chg1d, price: a.price,
          note: `${a.sector} · stock`,
        };
        return { ...base, sym: yahooOf(a.ticker), aum: (AVG_SECTOR_AUM * weight) / 100, note: `${weight}% of my portfolio · ${base.note}` };
      }),
    };
  }, [mine]);
  /* Every symbol on screen (both universes + macro strip + my portfolio) */
  const allSyms = useMemo(() => [...new Set([...SECTORS.flatMap((g) => g.etfs.map((e) => e.sym)), ...COUNTRY_SECTORS.flatMap((g) => g.etfs.map((e) => e.sym)), ...MACRO.map((m) => m.sym), ...(mineSector?.etfs.map((e) => e.sym) ?? [])])], [mineSector]);
  /* Live price (+ currency) for the tooltip */
  const snap = useSnapshot(allSyms);
  const liveEtf = useCallback(<T extends Etf>(e: T): T => {
    const s = snap[e.sym.toUpperCase()];
    return s ? { ...e, change1d: s.chg1d, price: s.price } : e;
  }, [snap]);
  /* THE return per ticker for the selected timeframe — Return_T = (P_now − P_start) / P_start (real closes;
     1D = vs previous close). Tile colour, tile %, tooltip, sector average, sorting and the macro strip all read it. */
  const rets = useHoldingReturns(allSyms, tf);
  const retOf = useCallback((e: Etf): number | null => rets.ret[e.sym.toUpperCase()] ?? null, [rets]);
  const macro = useMemo(() => MACRO.map(liveEtf), [liveEtf]);
  const groupsSrc = useMemo(() => {
    if (universe !== "ETF") return COUNTRY_SECTORS.map((x) => ({ ...x, etfs: x.etfs.map(liveEtf) }));
    const g = mineSector ? [mineSector, ...SECTORS] : SECTORS;
    return g.map((x) => ({ ...x, etfs: x.etfs.map(liveEtf) }));
  }, [universe, mineSector, liveEtf]);
  const shortOf = universe === "ETF" ? SHORT : COUNTRY_SHORT;
  const pickUniverse = (u: "ETF" | "COUNTRIES") => { setUniverse(u); setFocus([]); setTip(null); };
  const zoom = (t: string) => setFocus((f) => (f.length === 1 && f[0] === t ? [] : [t]));
  const compare = (t: string) => setFocus((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]));

  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const measure = () =>
      setSize((s) =>
        Math.abs(el.clientWidth - s.w) > 1 || Math.abs(el.clientHeight - s.h) > 1
          ? { w: el.clientWidth, h: el.clientHeight }
          : s
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const weightOf = useCallback((e: Etf) => (equalWeight ? 1 : Math.sqrt(e.aum)), [equalWeight]);

  const { sectors, count } = useMemo(() => {
    const cmp =
      sort === "aum" ? (a: Etf, b: Etf) => (b.aum - a.aum) * -dir
      : (a: Etf, b: Etf) => { const ra = retOf(a), rb = retOf(b); return ra == null || rb == null ? (ra == null ? 1 : 0) - (rb == null ? 1 : 0) : (rb - ra) * -dir; };

    const groups = groupsSrc.filter((g) => !focus.length || focus.includes(g.title)).map(({ title, etfs }) => {
      const rows = etfs.filter((e) => universe !== "ETF" || title === "MY PORTFOLIO" || !disabled[e.provider]).sort(cmp);
      const known = rows.map(retOf).filter((v): v is number => v != null);
      const avg = known.length ? known.reduce((s, v) => s + v, 0) / known.length : null;
      return {
        title,
        rows,
        avg,
        aum: rows.reduce((s, e) => s + e.aum, 0),
        wt: rows.reduce((s, e) => s + weightOf(e), 0),
      };
    }).filter((g) => g.rows.length);

    groups.sort(sort === "aum" ? (p, q) => (q.aum - p.aum) * -dir : (p, q) => ((q.avg ?? -Infinity) - (p.avg ?? -Infinity)) * -dir);

    const laid = layoutTreemap(groups, { x: 0, y: 0, w: size.w, h: size.h }).map(({ item, x, y, w, h }) => {
      const cardW = w - SECTOR_GAP * 2;
      const cardH = h - SECTOR_GAP * 2;
      const tiles = layoutTreemap(
        item.rows.map((etf) => ({ etf, wt: weightOf(etf) })),
        { x: 0, y: HEADER_H, w: cardW - 2, h: cardH - 2 - HEADER_H }
      );
      return { ...item, x: x + SECTOR_GAP, y: y + SECTOR_GAP, w: cardW, h: cardH, tiles };
    });

    return { sectors: laid, count: groups.reduce((n, g) => n + g.rows.length, 0) };
  }, [sort, dir, disabled, size, weightOf, focus, retOf, groupsSrc, universe]);

  const providerCounts = useMemo(() => {
    const all = SECTORS.flatMap((s) => s.etfs);
    return Object.fromEntries(PROVIDERS.map((p) => [p, all.filter((e) => e.provider === p).length]));
  }, []);

  const hoverHandlers = (etf: Etf) => ({
    // the deep view opens on the same timeframe when its chart has it
    onClick: () => { if (universe !== "ETF") return; const q = CHART_TF.has(tf) ? `?tf=${tf}` : ""; router.push(ETFS.some((e) => e.ticker === etf.ticker) ? `/etf/${etf.ticker}${q}` : `/stock/${etf.ticker}`); },
    onMouseEnter: (e: React.MouseEvent) => setTip({ etf, x: e.clientX, y: e.clientY }),
    onMouseMove: (e: React.MouseEvent) => setTip({ etf, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setTip(null),
  });

  const vw = typeof window !== "undefined" ? window.innerWidth : 1400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const tipRet = tip ? retOf(tip.etf) : null;
  const tipColor = tipRet == null ? "#71717a" : trendColor(tipRet);

  return (
    <div className="absolute inset-0 grid grid-cols-[260px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-4 overflow-hidden bg-[var(--oasis-bg)] p-4 font-sans text-zinc-200">
      {/* ── Sidebar ── */}
      <aside className="flex min-h-0 flex-col gap-5 self-stretch overflow-y-auto oasis-glass border border-white/[0.06] bg-[var(--oasis-panel)] p-3">
        <div className="flex flex-col gap-1">
          <span className={`${MONO} text-[13px] font-semibold tracking-[0.12em] text-zinc-50`}>[ ETF MARKET MAP ]</span>
        </div>

        <div className="flex flex-col gap-2.5">
          <SectionLabel>UNIVERSE</SectionLabel>
          <div className="flex gap-1.5">
            <ToggleButton active={universe === "ETF"} onClick={() => pickUniverse("ETF")}>ETFs</ToggleButton>
            <ToggleButton active={universe === "COUNTRIES"} onClick={() => pickUniverse("COUNTRIES")}>COUNTRIES</ToggleButton>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <SectionLabel>SIZING</SectionLabel>
          <div className="flex gap-1.5">
            <ToggleButton active={!equalWeight} onClick={() => setEqualWeight(false)}>
              MKT WEIGHT
            </ToggleButton>
            <ToggleButton active={equalWeight} onClick={() => setEqualWeight(true)}>
              EQUAL
            </ToggleButton>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <SectionLabel>SORTING</SectionLabel>
          <div className="flex gap-1.5">
            <ToggleButton active={sort === "aum"} onClick={() => pickSort("aum")}>
              AUM {sort === "aum" && dir === 1 ? "↑" : "↓"}
            </ToggleButton>
            <ToggleButton active={sort === "chg"} onClick={() => pickSort("chg")}>
              % CHG {sort === "chg" && dir === 1 ? "↑" : "↓"}
            </ToggleButton>
          </div>
        </div>

        {universe === "ETF" && (
        <div className="flex flex-col gap-2.5">
          <SectionLabel>PROVIDER FILTER</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {PROVIDERS.map((p) => {
              const on = !disabled[p];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDisabled((d) => ({ ...d, [p]: on }))}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-sm px-3 py-[9px] text-left hover:bg-white/10 ${
                    on ? "bg-white/[0.05]" : "bg-transparent"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 flex-none items-center justify-center rounded-xs border text-[10px] font-bold text-[#031] ${
                      on ? "border-[#34D399] bg-[#34D399]" : "border-white/[0.18] bg-transparent"
                    }`}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className={`flex-1 text-[13px] ${on ? "text-zinc-200" : "text-zinc-500"}`}>{p}</span>
                  <span className={`${MONO} text-[11px] text-zinc-600`}>{providerCounts[p]}</span>
                </button>
              );
            })}
          </div>
        </div>
        )}

      </aside>

      {/* ── Main ── */}
      <main className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto">
        {/* Sector zoom / compare bar */}
        <nav aria-label="Sectors" className={`${MONO} flex flex-none flex-wrap items-center gap-1 px-1 text-[11px]`}>
          <button type="button" onClick={() => setFocus([])} aria-pressed={!focus.length}
            className={`rounded-sm px-2 py-1 font-bold tracking-[0.1em] transition-colors duration-75 ${!focus.length ? "oasis-on" : "text-zinc-500 hover:bg-white/[0.05] hover:text-white"}`}>
            ALL
          </button>
          {groupsSrc.map(({ title }) => {
            const on = focus.includes(title);
            return (
              <button key={title} type="button" onClick={() => zoom(title)} onContextMenu={(e) => { e.preventDefault(); compare(title); }}
                aria-pressed={on} title="Click: zoom · Right-click: add to compare"
                className={`rounded-sm px-2 py-1 font-bold tracking-[0.1em] transition-colors duration-75 ${
                  on ? "oasis-on" : focus.length ? "text-zinc-600 hover:text-zinc-200" : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                }`}>
                {shortOf[title] ?? title}
              </button>
            );
          })}
          <span className="ml-auto text-[10px] tracking-[0.08em] text-zinc-600">{focus.length > 1 ? `COMPARE · ${focus.length} ${universe === "ETF" ? "SECTORS" : "COUNTRIES"}` : "RIGHT-CLICK = COMPARE"} · {count} {universe === "ETF" ? "ETF" : "INDICES"}</span>
        </nav>

        {/* Treemap */}
        <div ref={mapRef} className="relative min-h-[420px] flex-auto overflow-hidden bg-[var(--oasis-bg)]">
          {sectors.map((s) => (
            <div
              key={s.title}
              onContextMenu={(e) => { e.preventDefault(); compare(s.title); }}
              onMouseEnter={() => setHoverSector(s.title)}
              onMouseLeave={() => setHoverSector(null)}
              className={`absolute box-border overflow-hidden rounded-sm border bg-[var(--oasis-panel)] ${focus.includes(s.title) ? "border-oasis/60" : s.title === "MY PORTFOLIO" ? "border-emerald-400/40 shadow-[inset_0_0_18px_rgba(52,211,153,0.08)]" : "border-white/[0.06]"}`}
              style={{ left: s.x, top: s.y, width: s.w, height: s.h, zIndex: hoverSector === s.title ? 5 : 1 }}
            >
              <div className="absolute inset-x-0 top-0 flex h-[34px] items-center justify-between gap-2 overflow-hidden px-3.5">
                <button type="button" onClick={() => zoom(s.title)} title="Click: zoom · Right-click: compare"
                  className={`${MONO} min-w-0 truncate text-left text-[13px] font-bold tracking-[0.1em] hover:text-white ${s.title === "MY PORTFOLIO" ? "text-emerald-300" : "text-zinc-200"}`}>
                  {s.title === "MY PORTFOLIO" ? "★ " : ""}{s.title}{focus.length === 1 && focus[0] === s.title ? "  ← ALL" : ""}
                </button>
                <span className={`${MONO} flex-none text-[12px] font-bold`} style={{ color: s.avg == null ? "#52525b" : trendColor(s.avg) }} title={`Average ${tf} return of the tiles with data`}>
                  {s.avg == null ? "N/A" : fmtPct(s.avg)}
                </span>
              </div>

              {s.tiles.map(({ item: { etf }, x, y, w, h }) => {
                const m = Math.min(w, h);
                const r = retOf(etf);
                const showPct = h >= 34 && w >= 54;
                return (
                  <div
                    key={etf.ticker}
                    {...hoverHandlers(etf)}
                    className="on-color absolute box-border flex cursor-pointer flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[1px] border-b border-r border-[#030303] transition-[filter] duration-150 hover:z-20 hover:brightness-125"
                    style={{ left: x, top: y, width: w, height: h, background: rets.state === "loading" ? "#1c1c20" : r == null ? NA_TILE : tileBg(r / TF_SCALE[tf]) }}
                  >
                    <span
                      className={`${MONO} font-bold text-white`}
                      style={{ fontSize: Math.max(9, Math.min(22, Math.round(m / 4.2))) }}
                    >
                      {etf.ticker}
                    </span>
                    {showPct && (
                      <span
                        className={`${MONO} font-semibold text-white/85`}
                        style={{ fontSize: Math.max(9, Math.min(13, Math.round(m / 6))) }}
                      >
                        {rets.state === "loading" ? "···" : r == null ? "N/A" : fmtPct(r)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {sectors.length === 0 && (
            <div className="p-12 text-center text-[13px] text-zinc-500">No funds match the selected providers.</div>
          )}
        </div>

        {/* Timeframe rail (same as the charts) · colour scale — under the map, above the macro baseline */}
        <div className="flex flex-none flex-wrap items-center gap-x-6 gap-y-2 px-1">
          <SegRail items={TFS} value={tf} onChange={setTf} width={TFS.length * 44} />
          <div className="flex min-w-[260px] flex-1 items-center gap-3">
            <SectionLabel>COLOR SCALE</SectionLabel>
            <span className={`${MONO} text-[11px] text-zinc-500`}>−{(1.5 * TF_SCALE[tf]).toFixed(1).replace(/\.0$/, "")}%</span>
            <div className="h-2 flex-1 rounded-sm bg-[linear-gradient(90deg,#b91c1c_0_16%,#991b1b_16%_32%,#7f1d1d_32%_44%,#27272a_44%_56%,#064e3b_56%_68%,#065f46_68%_84%,#047857_84%)]" />
            <span className={`${MONO} text-[11px] text-zinc-500`}>+{(1.5 * TF_SCALE[tf]).toFixed(1).replace(/\.0$/, "")}%</span>
          </div>
        </div>

        {/* Macro baseline */}
        <div className="mt-1 box-border w-full flex-none rounded-sm border border-white/[0.06] bg-[var(--oasis-panel)] p-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {macro.map((m) => {
              const r = retOf(m), up = (r ?? 0) >= 0;
              return (
                <div
                  key={m.ticker}
                  {...hoverHandlers(m)}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-sm border border-white/[0.06] bg-white/[0.03] px-4 py-3 transition-all duration-75 hover:border-white/[0.2] hover:bg-white/[0.08]"
                >
                  <span className="flex items-baseline gap-2.5">
                    <span className={`${MONO} text-[16px] font-bold text-zinc-50`}>{m.ticker}</span>
                    <span className="text-[11.5px] uppercase tracking-[0.06em] text-zinc-500">{m.tag}</span>
                  </span>
                  <span
                    className={`${MONO} rounded-sm px-2 py-1 text-[13px] font-bold ${
                      r == null ? "bg-white/[0.04] text-zinc-600" : up ? "bg-emerald-500/10 text-[#34D399]" : "bg-rose-500/10 text-[#FB7185]"
                    }`}
                  >
                    {r == null ? (rets.state === "loading" ? "···" : "N/A") : fmtPct(r)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* ── Tooltip ── */}
      {tip && (
        <div
          className="pointer-events-none fixed z-[100] box-border flex w-72 flex-col gap-3 rounded-sm border border-white/[0.08] bg-[var(--oasis-panel)] p-4"
          style={{ left: Math.min(tip.x + 18, vw - 304), top: Math.max(8, Math.min(tip.y + 18, vh - 340)) }}
        >
          <div className="flex flex-col gap-0.5">
            <span className={`${MONO} text-[15px] font-bold text-zinc-50`}>{tip.etf.ticker}</span>
            <span className="text-xs text-zinc-400">{tip.etf.name}</span>
          </div>
          <TipSpark sym={tip.etf.sym} tf={tf} color={tipColor} />
          <div className={`${MONO} flex items-baseline justify-between`}>
            <span className="text-lg font-semibold text-zinc-50">{formatMarketValue(tip.etf.price || null, universe === "ETF" ? currencyOf(tip.etf.sym, { currency: snap[tip.etf.sym.toUpperCase()]?.currency }) : "PTS")}</span>
            <span className="text-[13px] font-bold" style={{ color: tipColor }}>
              {tipRet == null ? "N/A" : fmtPct(tipRet)} {tf}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-2.5">
            <span className={`${MONO} flex justify-between text-[10px] tracking-[0.1em] text-zinc-500`}>
              <span>[ CATALYST ]</span>
              {tipRet != null && <span className={tipRet >= 0 ? "text-emerald-400" : "text-rose-400"}>[ {tf}: {tipRet >= 0 ? "BULLISH" : "BEARISH"} ]</span>}
            </span>
            <span className="text-xs leading-snug text-zinc-300">{tip.etf.note}</span>
            <span className={`${MONO} text-[9.5px] tracking-[0.08em] text-zinc-600`}>{tf} RETURN = (LAST CLOSE − CLOSE {tf} AGO) / CLOSE {tf} AGO · YAHOO</span>
          </div>
        </div>
      )}
    </div>
  );
}
