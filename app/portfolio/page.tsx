"use client";

import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { OpenPositions, SEG_COLORS, SectorOverlap, positionUsd, useLots } from "@/components/PortfolioDeepView";
import { LookThroughFeed, PnlAttribution, RiskTelemetry, ToolSkeleton, riskStats } from "@/components/PortfolioTelemetry";
import InfernoChart, { type ChartTf } from "@/components/InfernoChart";
import CompositionMap from "@/components/deep-view/CompositionMap";
import ChartsTab from "@/components/deep-view/ChartsTab";
import { buildPortfolioFund, type PItem } from "@/lib/portfolio-fund";
import { useSnapshot } from "@/lib/market-snapshot";
import { useHistory, useLiveQuotes, yahooOf, type PTf } from "@/lib/portfolio-live";

/** portfolio chart rail — the history hook supports up to 3Y */
const PF_CHART_TFS: (ChartTf & PTf)[] = ["1D", "1W", "1M", "3M", "YTD", "1Y", "3Y"];
import PortfolioFlows from "@/components/PortfolioFlows";
import ResizableSplit from "@/components/ResizableSplit";
import PortfolioPies from "@/components/PortfolioPies";
import XtbImport, { type ImportResult } from "@/components/XtbImport";
import {
  PRESETS,
  assetClass,
  clearPortfolio,
  loadPortfolio,
  parsePortfolio,
  saveCustomAssets,
  savePortfolio,
  scenarioLoss,
  type Position,
  type SavedPortfolio,
} from "@/lib/portfolio";

/* ───────────────────────────── Theme ───────────────────────────── */

const card = "oasis-glass border border-white/[0.06] bg-[var(--oasis-panel)]";
const label = "font-mono text-[10px] font-semibold tracking-[0.14em] text-zinc-500";
const fmtP = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";

type View = "overview" | "deep-view";

/* ───────────────────────────── Motion ───────────────────────────── */

/** Each bottom card tumbles with its own tilt and drift, accelerating downwards (ease-in). */
const TUMBLE = [
  { rotate: -6, x: -40 },
  { rotate: 3, x: 12 },
  { rotate: 10, x: 56 },
];

const cardVariants: Variants = {
  rest: { opacity: 1, y: 0, x: 0, rotate: 0 },
  enter: (i: number) => ({
    opacity: 0,
    y: 90,
    x: TUMBLE[i].x * 0.3,
    rotate: TUMBLE[i].rotate * 0.4,
  }),
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    x: 0,
    rotate: 0,
    transition: { type: "spring", stiffness: 150, damping: 19, mass: 0.9, delay: 0.12 + i * 0.07 },
  }),
  fall: (i: number) => ({
    opacity: 0,
    y: 760,
    x: TUMBLE[i].x,
    rotate: TUMBLE[i].rotate,
    transition: {
      y: { duration: 0.85, ease: [0.55, 0.055, 0.675, 0.19], delay: i * 0.05 }, // ease-in-cubic = gravity
      x: { duration: 0.85, ease: "easeIn", delay: i * 0.05 },
      rotate: { duration: 0.85, ease: [0.4, 0, 0.9, 0.6], delay: i * 0.05 },
      opacity: { duration: 0.3, ease: "easeIn", delay: 0.5 + i * 0.05 },
    },
  }),
};

const fadeCardVariants: Variants = {
  rest: { opacity: 1 },
  enter: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  fall: { opacity: 0, transition: { duration: 0.2 } },
};

const LAYOUT_SPRING = { type: "spring", stiffness: 120, damping: 22, mass: 1 } as const;

/* ───────────────────────────── Builder / Whales data ───────────────────────────── */

/** Builder presets — illustrative model backtests (placeholder figures). */
const BUILD_PRESETS = [
  { id: "safe", name: "SAFE", tag: "40% DEFENSIVE", core: 55, thematic: 5, defensive: 40, cagr: 7.9, dd2022: -14.6, crash2020: -11.8, prompt: "VT SCHD TLT GLD 45/15/30/10" },
  { id: "balanced", name: "BALANCED", tag: "25% DEFENSIVE", core: 60, thematic: 15, defensive: 25, cagr: 11.6, dd2022: -19.8, crash2020: -13.9, prompt: "VOO VT SCHD TLT SMH 40/20/15/10/15" },
  { id: "growth", name: "GROWTH", tag: "10% DEFENSIVE", core: 50, thematic: 40, defensive: 10, cagr: 17.9, dd2022: -24.7, crash2020: -15.1, prompt: "VOO QQQ SMH GLD 40/25/25/10" },
  { id: "max", name: "MAX RISK", tag: "0% DEFENSIVE", core: 35, thematic: 65, defensive: 0, cagr: 24.8, dd2022: -28.4, crash2020: -16.2, prompt: "QQQ SMH SOXX ARKK 35/30/20/15" },
] as const;
type BuildPresetId = (typeof BUILD_PRESETS)[number]["id"];

/** Model account used for $ figures until real broker balances are connected. */
const MODEL_BALANCE = 124_580;
/** Rough "since purchase" gain per asset, derived from YTD (placeholder until real cost basis exists). */
const allTimeOf = (ytd: number) => (Math.pow(1 + ytd / 100, 1.92) - 1) * 100;

const usd = (v: number, digits = 0) =>
  (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/* ───────────────────────────── Stacked allocation bar ───────────────────────────── */

/** Thin at rest; on hover grows to h-5 and reveals ticker + weight inside each segment. */
function AllocationBar({ positions }: { positions: Position[] }) {
  return (
    <div className="group/alloc py-1" aria-label="Portfolio allocation">
      <div className="flex h-1.5 w-full overflow-hidden rounded-none bg-white/[0.04] transition-all duration-300 ease-out group-hover/alloc:h-4">
        {positions.map((p, i) => {
          const color = SEG_COLORS[i % SEG_COLORS.length];
          return (
            <div
              key={p.asset.ticker}
              title={`${p.asset.ticker} · ${p.weight}%`}
              className="relative flex h-full min-w-0 items-center justify-center border-r border-[var(--oasis-panel)] transition-[filter] duration-200 last:border-r-0 hover:brightness-125"
              style={{ width: `${p.weight}%`, background: color }}
            >
              <span className="truncate px-1.5 font-mono text-[9px] font-bold leading-none text-black/80 opacity-0 transition-opacity delay-75 duration-200 group-hover/alloc:opacity-100">
                {p.weight >= 6 ? `${p.asset.ticker} ${p.weight}%` : ""}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 opacity-70 transition-opacity group-hover/alloc:opacity-100">
        {positions.map((p, i) => (
          <span key={p.asset.ticker} className="flex items-center gap-1.5 font-mono text-[10.5px] text-zinc-400">
            <span className="h-2 w-2 rounded-sm" style={{ background: SEG_COLORS[i % SEG_COLORS.length] }} />
            {p.asset.ticker} <span className="text-zinc-200">{p.weight}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const WHALES = [
  { name: "Berkshire Hathaway", sub: "Buffett · 42 positions", move: "BUY", qq: 4.2, alloc: "22.4%", prompt: "XLF AAPL XLP XLE 35/25/20/20" },
  { name: "Bridgewater", sub: "Dalio · 612 positions", move: "TRIM", qq: -12.6, alloc: "8.1%", prompt: PRESETS.dalio },
  { name: "BlackRock Model", sub: "Target allocation", move: "HOLD", qq: 0, alloc: "60/40", prompt: "VOO TLT 60/40" },
  { name: "Renaissance", sub: "Quant · 3,104 positions", move: "BUY", qq: 1.1, alloc: "3.2%", prompt: "VTI QQQ IWM 40/30/30" },
];
const MOVE_STYLE: Record<string, string> = {
  BUY: "bg-emerald-500/10 text-emerald-400",
  TRIM: "bg-rose-500/10 text-rose-400",
  HOLD: "bg-white/[0.06] text-zinc-400",
};

/* ───────────────────────────── Small pieces ───────────────────────────── */



const ghostBtn = "rounded-sm border border-white/[0.1] px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.08em] text-zinc-100 transition-colors hover:bg-white/[0.06]";

/* ───────────────────────────── Page ───────────────────────────── */

export default function PortfolioPage() {
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState(PRESETS.classic);
  const [presetId, setPresetId] = useState<BuildPresetId>("max");
  const [comparing, setComparing] = useState(false);
  const [saved, setSaved] = useState<SavedPortfolio | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [view, setView] = useState<View>("overview");
  /** Deep view: chart (+ capital flow) timeframe and the positions-table timeframe */
  const [chartTf, setChartTf] = useState<ChartTf & PTf>("1Y");
  const [pfTab, setPfTab] = useState<"OV" | "MAP" | "SEAS" | "NEWS" | "AN" | "TOOLS">("OV");
  const [tableTf, setTableTf] = useState<PTf>("1D");
  /** Second phase of the transition: the card grows a beat after the bottom cards start falling. */
  const [expanded, setExpanded] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Restore the user's saved portfolio after mount (browser storage is unavailable during SSR,
  // so this one-time sync from an external store has to happen in an effect).
  useEffect(() => {
    const p = loadPortfolio();
    /* eslint-disable react-hooks/set-state-in-effect */
    if (p) { setSaved(p); setPrompt(p.prompt); }
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Esc returns from the deep view (ref keeps the listener pointed at the latest handler).
  const goOverviewRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (view !== "deep-view") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") goOverviewRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const showMine = loaded && saved !== null && !editing;
  const isDeep = showMine && view === "deep-view"; // bottom cards gone
  const isExpanded = showMine && expanded; // card grown + analytics shown
  const parsed = useMemo(() => parsePortfolio(prompt), [prompt]);
  const preset = BUILD_PRESETS.find((b) => b.id === presetId)!;

  /* Live quotes (→ USD) and price history for the deep view */
  const { lots, save: saveLot, setAll: setAllLots } = useLots();
  const posItems = useMemo(() => parsed.positions.map((p) => ({ ticker: p.asset.ticker, lot: lots[p.asset.ticker] })), [parsed.positions, lots]);
  const accountCcy = Object.values(lots).find((l) => l.ccy)?.ccy;
  const { live, fx } = useLiveQuotes(posItems, accountCcy);
  const symOf = useMemo(() => Object.fromEntries(posItems.map((i) => [i.ticker, live[i.ticker]?.sym ?? yahooOf(i.ticker, i.lot?.sym)])), [posItems, live]);
  /* Today's real 1D / YTD (Yahoo) on every position — the database values are only a fallback */
  const snap = useSnapshot(useMemo(() => Object.values(symOf), [symOf]));
  /* Real weights = each position's USD market value ÷ total (same formula as the positions table), once every
     FX rate is in; until then (or with no imported lots) the saved target weights are used. */
  const usdVal = useMemo(() => {
    const rows = parsed.positions.map((p) => ({ t: p.asset.ticker, ...positionUsd(p, lots, live, fx) }));
    const total = rows.reduce((a, r) => a + r.value, 0);
    const ok = Object.keys(lots).length > 0 && rows.every((r) => r.ready) && total > 0;
    const cost = rows.reduce((a, r) => a + r.cost, 0);
    return { total: ok ? total : null, cost: ok ? cost : null, w: ok ? Object.fromEntries(rows.map((r) => [r.t, +((r.value / total) * 100).toFixed(2)])) : null };
  }, [parsed.positions, lots, live, fx]);
  const livePos = useMemo(() => parsed.positions.map((p) => {
    const s = snap[(symOf[p.asset.ticker] ?? p.asset.ticker).toUpperCase()];
    const weight = usdVal.w?.[p.asset.ticker] ?? p.weight;
    return s ? { ...p, weight, asset: { ...p.asset, chg1d: s.chg1d, ytd: s.ytd ?? p.asset.ytd, price: s.currency === "USD" ? s.price : p.asset.price } } : { ...p, weight };
  }), [parsed.positions, snap, symOf, usdVal]);
  const assets = useMemo(() => livePos.map((p) => p.asset), [livePos]);
  const chartHist = useHistory(isExpanded ? assets : [], symOf, chartTf);
  const tableHist = useHistory(isExpanded ? assets : [], symOf, tableTf);
  /* The portfolio as one look-through "fund" for the Composition Map / Charts / News tabs */
  const pItems = useMemo<PItem[]>(() => livePos.map(({ asset: a, weight }) => ({ ticker: a.ticker, name: a.name, weight, kind: a.kind, sector: a.sector, ytd: a.ytd, chg1d: a.chg1d })), [livePos]);
  const pfFund = useMemo(() => buildPortfolioFund(pItems), [pItems]);
  /* Risk telemetry (1Y path vs SPY) + today's attribution */
  const riskHist = useHistory(isExpanded ? assets : [], symOf, "1Y");
  const risk = useMemo(() => riskStats(riskHist.data?.series, Object.fromEntries(livePos.map((p) => [p.asset.ticker, p.weight]))), [riskHist.data, livePos]);
  const attribRows = useMemo(() => livePos.map((p) => ({ ticker: p.asset.ticker, name: p.asset.name, weight: p.weight, chg: live[p.asset.ticker]?.chg ?? p.asset.chg1d })), [livePos, live]);
  const byWeight = useMemo(() => [...livePos].sort((a, b) => b.weight - a.weight), [livePos]);
  const chartMain = useMemo(() => ({ id: "PF", label: "MY PORTFOLIO", color: "#34d399", basket: livePos.map((p) => ({ sym: symOf[p.asset.ticker] ?? p.asset.ticker, weight: p.weight })) }), [livePos, symOf]);
  const chartPinned = useMemo(() => [
    { id: "SPY", label: "S&P 500", sym: "SPY", color: "#a1a1aa", dashed: true },
    ...byWeight.slice(0, 5).map((p, i) => ({ id: `top:${p.asset.ticker}`, label: p.asset.ticker, sym: symOf[p.asset.ticker] ?? p.asset.ticker, color: ["#60a5fa", "#f59e0b", "#f472b6", "#22d3ee", "#a3e635"][i] })),
  ], [byWeight, symOf]);
  const chartPicker = useMemo(() => byWeight.map((p) => ({ sym: symOf[p.asset.ticker] ?? p.asset.ticker, label: p.asset.ticker, sub: `${p.weight}% · ${p.asset.name}` })), [byWeight, symOf]);

  /* Headline money metrics for the model account. */
  const todayPct = livePos.reduce((a, p) => a + (p.weight / 100) * p.asset.chg1d, 0);
  const ytdPct = livePos.reduce((a, p) => a + (p.weight / 100) * p.asset.ytd, 0);
  const allTimePct = livePos.reduce((a, p) => a + (p.weight / 100) * allTimeOf(p.asset.ytd), 0);
  // real account (imported from XTB, in USD) when available, otherwise the model account
  const BAL = usdVal.total ?? MODEL_BALANCE;
  const realGain = usdVal.total != null && usdVal.cost ? ((usdVal.total - usdVal.cost) / usdVal.cost) * 100 : null;
  const gainPct = realGain ?? allTimePct;
  const todayUsd = (BAL * todayPct) / 100;

  const METRICS = [
    { k: "TODAY P&L", v: fmtP(todayPct), sub: (todayUsd >= 0 ? "+" : "") + usd(todayUsd), tone: todayPct >= 0 ? "up" : "down" },
    { k: "YTD RETURN", v: fmtP(ytdPct), sub: "since Jan 1", tone: ytdPct >= 0 ? "up" : "down" },
    { k: "TOTAL BALANCE", v: usd(BAL, 2), sub: usdVal.total != null ? "market value · USD" : "model account", tone: "flat" },
    { k: usdVal.total != null ? "UNREALIZED GAIN" : "ALL-TIME GAIN", v: (gainPct >= 0 ? "+" : "") + gainPct.toFixed(1) + "%", sub: (gainPct >= 0 ? "+" : "") + usd(usdVal.total != null && usdVal.cost != null ? usdVal.total - usdVal.cost : BAL - BAL / (1 + gainPct / 100)), tone: gainPct >= 0 ? "up" : "down" },
  ] as const;
  const toneTxt = (t: string, dim = false) => (t === "up" ? (dim ? "text-emerald-400/70" : "text-emerald-400") : t === "down" ? (dim ? "text-rose-400/70" : "text-rose-400") : dim ? "text-zinc-600" : "text-zinc-50");

  /* "Compare with my portfolio" — same scenarios applied to the saved portfolio. */
  const mine = useMemo(() => {
    if (!saved) return null;
    const pos = parsePortfolio(saved.prompt).positions;
    const defensive = pos.filter((p) => ["bond", "gold"].includes(assetClass(p.asset))).reduce((a, p) => a + p.weight, 0);
    return {
      cagr: pos.reduce((a, p) => a + (p.weight / 100) * p.asset.ytd, 0),
      dd2022: scenarioLoss(pos, "rates").total,
      crash2020: scenarioLoss(pos, "covid").total,
      defensive,
    };
  }, [saved]);

  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };

  /** Freeze the page scroll while cards fly, so falling cards are clipped by the viewport
      instead of stretching the scrollbar. */
  const lockScroll = (ms: number) => {
    const main = document.querySelector("main");
    if (!main) return;
    main.scrollTo({ top: 0 });
    main.style.overflowY = "hidden";
    later(ms, () => { main.style.overflowY = ""; });
  };
  const scrollTop = () => document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });

  function goDeep() {
    if (view === "deep-view") return;
    lockScroll(reduceMotion ? 0 : 1100);
    setView("deep-view");
    later(reduceMotion ? 0 : 300, () => setExpanded(true));
  }
  function goOverview() {
    lockScroll(reduceMotion ? 0 : 900);
    setExpanded(false);
    setView("overview");
  }
  useEffect(() => { goOverviewRef.current = goOverview; });
  // Clicking PORTFOLIO in the top bar while already here → back to the portfolio overview.
  useEffect(() => {
    const onReset = (e: Event) => { if ((e as CustomEvent<string>).detail === "/portfolio") goOverviewRef.current(); };
    window.addEventListener("inferno:nav-same", onReset);
    return () => window.removeEventListener("inferno:nav-same", onReset);
  }, []);

  const applyPrompt = (p: string) => {
    setPrompt(p);
    setEditing(true);
    setView("overview");
    setExpanded(false);
    scrollTop();
    inputRef.current?.focus();
  };

  const run = () => {
    if (!parsed.valid) return;
    savePortfolio(prompt);
    setSaved({ prompt, createdAt: new Date().toISOString() });
    setEditing(false);
  };

  /** XTB screenshot → positions, lots (qty / avg price / broker P&L) and any instruments outside our database. */
  const importXtb = (r: ImportResult) => {
    saveCustomAssets(r.customs);
    let prompt = r.prompt, nextLots = r.lots;
    if (saved) {
      // A portfolio already exists → ADD the imported positions (same ticker = replaced by the new screenshot),
      // then re-weight everything by market value.
      const old = parsePortfolio(saved.prompt).positions.filter((p) => !(p.asset.ticker in r.lots));
      const newVals = Object.entries(r.lots).map(([t, l]) => [t, l.value ?? l.qty * (l.price ?? l.avg)] as const);
      const newTotal = newVals.reduce((a, [, v]) => a + v, 0);
      const known = old.filter((p) => lots[p.asset.ticker]?.value != null);
      const perPct = known.length
        ? known.reduce((a, p) => a + lots[p.asset.ticker].value!, 0) / known.reduce((a, p) => a + p.weight, 0)
        : newTotal / 100; // no values for the old positions → assume the old portfolio was as large as the import
      const vals: (readonly [string, number])[] = [...old.map((p) => [p.asset.ticker, lots[p.asset.ticker]?.value ?? p.weight * perPct] as const), ...newVals];
      const total = vals.reduce((a, [, v]) => a + v, 0) || 1;
      const w = vals.map(([, v]) => +((v / total) * 100).toFixed(2));
      w[w.length - 1] = +(100 - w.slice(0, -1).reduce((a, x) => a + x, 0)).toFixed(2);
      prompt = `${vals.map(([t]) => t).join(" ")} ${w.join("/")}`;
      nextLots = { ...lots, ...r.lots };
    }
    setAllLots(nextLots);
    savePortfolio(prompt);
    setPrompt(prompt);
    setSaved({ prompt, createdAt: saved?.createdAt ?? new Date().toISOString() });
    setImporting(false);
    setEditing(false);
    goDeep(); // straight into the deep view of the portfolio
  };

  const [confirmDel, setConfirmDel] = useState(false);
  const resetPortfolio = () => {
    clearPortfolio();
    setAllLots({});
    setConfirmDel(false);
    setSaved(null);
    setEditing(false);
    setView("overview");
    setExpanded(false);
    setPrompt(PRESETS.classic);
  };



  /** Click anywhere on the My-portfolio card (except its buttons/links) to open the deep view. */
  const onCardClick = (e: React.MouseEvent) => {
    if (view !== "overview") return;
    if ((e.target as HTMLElement).closest("a,button,input")) return;
    goDeep();
  };

  const variants = reduceMotion ? fadeCardVariants : cardVariants;

  /* ── Bottom cards ── */
  const bottomCards = [
    /* Builder */
    <>
      <div className="flex items-baseline justify-between">
        <span className={`${label} flex items-center gap-2 text-zinc-300`}><span className="h-1.5 w-1.5 rounded-none bg-emerald-400" />BUILDER</span>
        <span className="font-mono text-[10px] text-zinc-600">4 presets · model</span>
      </div>
      <div>
        <h2 className="font-mono text-[12px] font-bold tracking-[0.16em] text-zinc-200">[ MODEL ALLOCATIONS ]</h2>
        <p className="mt-1 text-[12.5px] text-zinc-500 xl:hidden">Pick a risk profile and preview how it would have held up.</p>
      </div>

      {/* Preset picker */}
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {BUILD_PRESETS.map((b) => {
          const on = b.id === presetId;
          const hot = b.id === "max";
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => { setPresetId(b.id); setComparing(false); }}
              className={`flex min-w-0 flex-col items-start gap-0.5 rounded-sm border px-2.5 py-1.5 text-left transition-colors ${
                on
                  ? hot ? "border-red-500/50 bg-red-500/[0.08]" : "border-emerald-400/40 bg-emerald-400/[0.06]"
                  : "border-white/[0.06] bg-[var(--oasis-bg)]/60 hover:border-white/[0.12]"
              }`}
            >
              <span className={`font-mono text-[11px] font-bold tracking-[0.08em] ${on ? (hot ? "text-red-300" : "text-emerald-300") : "text-zinc-300"}`}>{b.name}</span>
              <span className="truncate font-mono text-[9px] tracking-[0.06em] text-zinc-500">{b.tag}</span>
            </button>
          );
        })}
      </div>

      {/* Allocation of the preset */}
      <div className="flex flex-col gap-2">
        <div className="flex h-1.5 overflow-hidden rounded-none bg-white/[0.04]">
          <div className="bg-emerald-400 transition-[width] duration-300" style={{ width: `${preset.core}%` }} />
          <div className="bg-zinc-400 transition-[width] duration-300" style={{ width: `${preset.thematic}%` }} />
          <div className="bg-sky-400 transition-[width] duration-300" style={{ width: `${preset.defensive}%` }} />
        </div>
        <div className="flex justify-between font-mono text-[10px]">
          <span className="text-zinc-500">CORE <span className="text-zinc-200">{preset.core}%</span></span>
          <span className="text-zinc-500">THEMATIC <span className="text-zinc-200">{preset.thematic}%</span></span>
          <span className="text-zinc-500">DEFENSIVE <span className={preset.defensive === 0 ? "text-red-400" : "text-zinc-200"}>{preset.defensive}%</span></span>
        </div>
      </div>

      {/* Performance teaser / comparison */}
      {comparing && mine ? (
        <div className="flex flex-col rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)]/60">
          <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] gap-2 border-b border-white/[0.06] px-3 py-2 font-mono text-[9.5px] tracking-[0.12em] text-zinc-600">
            <span>METRIC</span><span className="text-right">{preset.name}</span><span className="text-right">MINE</span>
          </div>
          {([
            ["3Y CAGR", preset.cagr, mine.cagr, true],
            ["2022 REPLAY", preset.dd2022, mine.dd2022, true],
            ["2020 CRASH", preset.crash2020, mine.crash2020, true],
            ["DEFENSIVE", preset.defensive, mine.defensive, null],
          ] as const).map(([k, a, b, higherBetter]) => {
            // Higher is better for every row with a verdict (drawdowns are negative: less negative wins).
            const aWins = higherBetter === null || a === b ? null : a > b;
            const fmt = (v: number) => (k === "DEFENSIVE" ? `${v.toFixed(0)}%` : (v >= 0 ? "+" : "") + v.toFixed(1) + "%");
            return (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-2 px-3 py-1.5 font-mono text-[12px]">
                <span className="text-[10.5px] tracking-[0.08em] text-zinc-500">{k}</span>
                <span className={`text-right ${aWins === true ? "font-bold text-emerald-400" : "text-zinc-200"}`}>{fmt(a)}</span>
                <span className={`text-right ${aWins === false ? "font-bold text-emerald-400" : "text-zinc-200"}`}>{fmt(b)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)]/60 p-3">
          <div className="flex items-baseline justify-between">
            <span className={label}>3Y ANNUALIZED RETURN</span>
            <span className="font-mono text-[20px] font-semibold tabular-nums text-emerald-400">+{preset.cagr.toFixed(1)}%<span className="ml-1 text-[11px] text-emerald-400/70">CAGR</span></span>
          </div>
          {([["2022 Drawdown Replay", preset.dd2022], ["2020 Flash Crash", preset.crash2020]] as const).map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="text-[12px] text-zinc-400">{k}</span>
                <span className="font-mono text-[12px] font-semibold tabular-nums text-rose-400">{v.toFixed(1)}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-none bg-white/[0.05]">
                <div className="h-full rounded-none bg-rose-500/80 transition-[width] duration-300" style={{ width: `${Math.min(100, Math.abs(v) * 2)}%` }} />
              </div>
            </div>
          ))}
          <span className="font-mono text-[9px] tracking-[0.1em] text-zinc-600 xl:hidden">MODEL BACKTEST · PLACEHOLDER DATA</span>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
        <button type="button" onClick={() => applyPrompt(preset.prompt)} className="font-mono text-[11px] tracking-[0.06em] text-zinc-500 transition-colors hover:text-white" title={preset.prompt}>
          Use preset
        </button>
        <button
          type="button"
          disabled={!mine}
          onClick={() => setComparing((c) => !c)}
          title={mine ? undefined : "Build your portfolio first"}
          className="rounded-sm bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-100 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {comparing ? "[ ← PRESET ]" : "[ COMPARE VS MINE → ]"}
        </button>
      </div>
    </>,

    /* Whales */
    <>
      <div className="flex items-baseline justify-between">
        <span className={`${label} flex items-center gap-2 text-zinc-300`}><span className="h-1.5 w-1.5 rounded-none bg-zinc-300" />WHALES</span>
        <span className="font-mono text-[10px] text-zinc-600">13F · Q2 2026</span>
      </div>
      <div>
        <h2 className="font-mono text-[12px] font-bold tracking-[0.16em] text-zinc-200">[ 13F FLOWS ]</h2>
        <p className="mt-1 text-[12.5px] text-zinc-500 xl:hidden">Latest filings. Clone the proportions in one click.</p>
      </div>
      <div className="flex flex-col">
        <div className="grid grid-cols-[minmax(0,1fr)_56px_64px_56px] gap-2 border-b border-white/[0.06] pb-2 font-mono text-[9.5px] tracking-[0.12em] text-zinc-600">
          <span>ENTITY</span><span>MOVE</span><span className="text-right">Q/Q</span><span className="text-right">ALLOC</span>
        </div>
        {WHALES.map((w) => (
          <button
            key={w.name}
            type="button"
            onClick={() => applyPrompt(w.prompt)}
            title={`Clone: ${w.prompt}`}
            className="group grid grid-cols-[minmax(0,1fr)_56px_64px_56px] items-center gap-2 border-b border-white/[0.06] py-2 text-left transition-colors hover:bg-white/[0.02]"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-zinc-100">{w.name}</span>
              <span className="block truncate text-[11px] text-zinc-500">
                <span className="group-hover:hidden">{w.sub}</span>
                <span className="hidden text-emerald-400 group-hover:inline">Clone → {w.prompt}</span>
              </span>
            </span>
            <span className={`justify-self-start rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold ${MOVE_STYLE[w.move]}`}>{w.move}</span>
            <span className={`text-right font-mono text-[12px] ${w.qq > 0 ? "text-emerald-400" : w.qq < 0 ? "text-rose-400" : "text-zinc-500"}`}>{w.qq > 0 ? "+" : ""}{w.qq.toFixed(1)}%</span>
            <span className="text-right font-mono text-[12px] font-semibold text-zinc-100">{w.alloc}</span>
          </button>
        ))}
      </div>
      <Link href={`/chat?q=${encodeURIComponent("Pokaż mi portfele największych inwestorów (Buffett, Dalio, BlackRock) i jak odwzorować je ETF-ami.")}`} className={`${ghostBtn} mt-auto self-start`}>
        [ 13F DETAIL → ]
      </Link>
    </>,
  ];

  return (
    // flex-none: the page grows with its content (never squeezed to the viewport);
    // falling cards are clipped by <main> while its scroll is locked during the transition.
    <div className="relative mx-auto flex min-h-full w-full max-w-[3200px] flex-none flex-col gap-3 overflow-x-clip bg-[var(--oasis-bg)] px-3 min-[1800px]:px-6 pb-5 pt-3">
      {/* XTB import over an existing portfolio: replaces positions after review */}
      {importing && showMine && (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--oasis-bg)]/85 p-4" onClick={() => setImporting(false)}>
          <div className="mx-auto mt-10 max-w-[1500px]" onClick={(e) => e.stopPropagation()}>
            <XtbImport onImport={importXtb} onClose={() => setImporting(false)} />
          </div>
        </div>
      )}
      <motion.nav layout="position" aria-label="Breadcrumb" className="font-mono text-[10px] tracking-[0.14em] text-zinc-600">
        [ {isDeep ? (
          <button type="button" onClick={goOverview} className="tracking-[0.14em] text-zinc-500 underline-offset-2 transition-colors hover:text-white hover:underline">PORTFOLIO</button>
        ) : <span className="text-zinc-300">PORTFOLIO</span>}
        {isDeep && <> / <span className="text-zinc-300">DEEP VIEW</span></>} ]
      </motion.nav>

      <LayoutGroup>
        {/* Dashboard: portfolio 3/4 · builder + whales (insight) 1/4. Deep view: full width. */}
        {/* Dashboard: portfolio on top (~3/4 of the screen), builder + whales side by side below */}
        <div className="flex flex-col gap-3">
        {!loaded ? (
          <section className={`${card} h-[300px] animate-pulse`} />
        ) : showMine ? (
          /* ── My portfolio: compact (overview) ⇄ expanded (deep-view) ── */
          <motion.section
            layout
            transition={{ layout: reduceMotion ? { duration: 0 } : LAYOUT_SPRING }}
            onClick={onCardClick}
            title={isDeep ? undefined : "Click for the full portfolio deep view"}
            className={`${card} flex flex-none flex-col gap-3 p-3 ${isExpanded ? "min-h-[calc(100dvh-230px)]" : isDeep ? "" : "cursor-pointer transition-colors hover:border-white/[0.09]"}`}
          >
            <motion.div layout="position" className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-3">
                <AnimatePresence initial={false}>
                  {isDeep && (
                    <motion.button
                      type="button"
                      onClick={goOverview}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0, transition: { delay: 0.2 } }}
                      exit={{ opacity: 0, x: -8, transition: { duration: 0.12 } }}
                      className="self-start rounded-sm border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white"
                    >
                      [ ← OVERVIEW ]
                    </motion.button>
                  )}
                </AnimatePresence>
                <div>
                  <h1 className="font-mono text-[15px] font-bold tracking-[0.16em] text-zinc-50">
                    [ PORTFOLIO ]{isDeep && <span className="ml-3 align-middle font-mono text-[12px] font-bold tracking-[0.14em] text-red-400">DEEP VIEW</span>}
                  </h1>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                {isDeep ? (
                  <>
                    {/* Headline metrics move up here in the deep view */}
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0, transition: { delay: 0.2 } }}
                      className="grid grid-cols-2 gap-2 md:grid-cols-4"
                    >
                      {METRICS.map((m) => (
                        <div key={m.k} className="min-w-[150px] rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] px-3 py-1.5">
                          <div className="font-mono text-[9px] font-semibold tracking-[0.14em] text-zinc-500">{m.k}</div>
                          <div className="flex items-baseline gap-1.5">
                            <span className={`font-mono text-[15px] font-semibold tabular-nums ${toneTxt(m.tone)}`}>{m.v}</span>
                            <span className={`font-mono text-[10px] tabular-nums ${toneTxt(m.tone, true)}`}>{m.sub}</span>
                          </div>
                        </div>
                      ))}
                      {/* Risk telemetry directly under the balance */}
                      <div className="col-span-full"><RiskTelemetry stats={risk} model={riskHist.data?.model} /></div>
                    </motion.div>
                    <button type="button" onClick={() => setImporting(true)} className={ghostBtn} title="Adds the positions from a new XTB screenshot to this portfolio">[ + ADD FROM XTB ]</button>
                    {confirmDel ? (
                      <span className="flex items-center gap-1">
                        <button type="button" onClick={resetPortfolio} className="rounded-sm border border-rose-500/60 bg-rose-500/15 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.08em] text-rose-300 hover:bg-rose-500/25">[ YES, DELETE ALL ]</button>
                        <button type="button" onClick={() => setConfirmDel(false)} className={ghostBtn}>[ CANCEL ]</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmDel(true)} title="Delete the whole portfolio and start again" className="rounded-sm border border-rose-500/25 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.08em] text-rose-400/80 transition-colors hover:bg-rose-500/10 hover:text-rose-300">[ DELETE PORTFOLIO ]</button>
                    )}
                    <Link href="/portfolio/holdings" className={ghostBtn}>[ HOLDINGS → ]</Link>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setImporting(true)} className={ghostBtn} title="Adds the positions from a new XTB screenshot to this portfolio">[ + ADD FROM XTB ]</button>
                    {confirmDel ? (
                      <span className="flex items-center gap-1">
                        <button type="button" onClick={resetPortfolio} className="rounded-sm border border-rose-500/60 bg-rose-500/15 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.08em] text-rose-300 hover:bg-rose-500/25">[ YES, DELETE ALL ]</button>
                        <button type="button" onClick={() => setConfirmDel(false)} className={ghostBtn}>[ CANCEL ]</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmDel(true)} title="Delete the whole portfolio and start again" className="rounded-sm border border-rose-500/25 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.08em] text-rose-400/80 transition-colors hover:bg-rose-500/10 hover:text-rose-300">[ DELETE PORTFOLIO ]</button>
                    )}
                    <button type="button" onClick={() => setEditing(true)} className={ghostBtn}>[ EDIT ]</button>
                    <button type="button" onClick={goDeep} className="rounded-sm bg-red-500 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.08em] text-white transition-colors hover:bg-red-400">
                      [ DEEP VIEW → ]
                    </button>
                  </>
                )}
              </div>
            </motion.div>

            {!isDeep && (
              <motion.div layout="position">
                <AllocationBar positions={livePos} />
              </motion.div>
            )}

            {/* Deep view tabs — same as an ETF's deep view */}
            {isExpanded && (
              <nav className="-mt-1 flex flex-wrap gap-x-8 border-b border-white/[0.06]" onClick={(e) => e.stopPropagation()}>
                {([["OV", "OVERVIEW"], ["MAP", "COMPOSITION MAP"], ["SEAS", "CHARTS"], ["NEWS", "NEWS"], ["AN", "ANALYZE"], ["TOOLS", "TOOLS"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setPfTab(k)}
                    className={`-mb-px whitespace-nowrap border-b-2 pb-2.5 pt-1 font-mono text-[13px] font-semibold uppercase tracking-[0.06em] ${pfTab === k ? "oasis-tab" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
                    [ {l} ]
                  </button>
                ))}
              </nav>
            )}

            {isExpanded && pfTab !== "OV" ? (
              <div onClick={(e) => e.stopPropagation()} className="flex min-w-0 flex-col gap-3">
                {pfTab === "MAP" && <><SectorOverlap positions={livePos} /><CompositionMap fund={pfFund} main={chartMain} /></>}
                {pfTab === "SEAS" && <ChartsTab fund={pfFund} main={chartMain} />}
                {pfTab === "NEWS" && <LookThroughFeed items={pItems} />}
                {pfTab === "AN" && (
                  <section className="flex flex-col gap-2 border border-white/[0.05] bg-[var(--oasis-bg)] p-3">
                    <span className="font-mono text-[11px] font-bold tracking-[0.14em] text-zinc-200">[ CAPITAL FLOW &amp; SECTOR SHIFT ENGINE · {chartTf} ]</span>
                    <PortfolioFlows positions={livePos} tf={chartTf} rets={chartHist.rets} />
                  </section>
                )}
                {pfTab === "TOOLS" && <ToolSkeleton title="PORTFOLIO TOOLS" lines={["REBALANCER · TARGET VS ACTUAL", "WHAT-IF · ADD / TRIM SIMULATOR", "TAX-LOT & FX IMPACT"]} />}
              </div>
            ) : isExpanded ? (
              /* Overview: chart ⇄ positions in resizable panes */
              <motion.div layout="position" onClick={(e) => e.stopPropagation()}>
                <ResizableSplit
                  storageKey="inferno.portfolio.deep.top.v3"
                  minPx={[520, 640]}
                  initial={0.56}
                  height={{ initial: 520, min: 360, max: 1100 }}
                  left={() => (
                    <div className="flex h-full min-h-[420px] flex-col gap-2 rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] p-3">
                      <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-zinc-300">PERFORMANCE</span>
                      <InfernoChart main={chartMain} pinned={chartPinned} picker={chartPicker} tf={chartTf} onTfChange={(t) => setChartTf(t as ChartTf & PTf)} tfs={PF_CHART_TFS} valueScale={usdVal.total ?? MODEL_BALANCE} />
                    </div>
                  )}
                  right={(h) => (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.2 } }} className={h ? "h-full overflow-y-auto" : ""}>
                      <OpenPositions positions={livePos} lots={lots} saveLot={saveLot} live={live} fx={fx} tf={tableTf} onTfChange={setTableTf} rets={tableHist.rets} />
                    </motion.div>
                  )}
                />
              </motion.div>
            ) : (
            /* Chart (left) · metrics + positions (right) — side by side on wide screens */
            <motion.div layout="position" className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
              <div onClick={(e) => e.stopPropagation()} className="min-w-0">
                <div className="flex h-[max(260px,calc(100dvh-735px))] flex-col rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] p-3">
                  <InfernoChart main={chartMain} pinned={chartPinned} picker={chartPicker} tf={chartTf} onTfChange={(t) => setChartTf(t as ChartTf & PTf)} tfs={PF_CHART_TFS} valueScale={usdVal.total ?? MODEL_BALANCE} />
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-2.5">
                {isExpanded ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.2 } }} className="h-full" onClick={(e) => e.stopPropagation()}>
                    <PortfolioFlows positions={livePos} tf={chartTf} rets={chartHist.rets} />
                  </motion.div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-2">
                    {METRICS.map((m) => (
                      <div key={m.k} className="rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)]/60 px-3.5 py-2">
                        <div className={label}>{m.k}</div>
                        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                          <span className={`font-mono text-[18px] font-semibold tabular-nums ${toneTxt(m.tone)}`}>{m.v}</span>
                          <span className={`font-mono text-[10.5px] tabular-nums ${toneTxt(m.tone, true)}`}>{m.sub}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {!isExpanded && (
                    /* Compact rows — the doorway into each ETF's Deep View */
                    <motion.div
                      key="rows"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { delay: 0.15 } }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                      className="flex min-h-0 flex-col gap-1.5 xl:max-h-[max(150px,calc(100dvh-880px))] xl:overflow-y-auto xl:pr-1"
                    >
                  {livePos.map((p, i) => {
                    const color = SEG_COLORS[i % SEG_COLORS.length];
                    const isEtf = p.asset.kind === "etf";
                    const body = (
                      <>
                        <span className="h-7 w-1 flex-none rounded-none" style={{ background: color }} />
                        <div className="flex w-[150px] min-w-0 flex-none flex-col">
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-[16px] font-bold text-zinc-50">{p.asset.ticker}</span>
                            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] text-zinc-400">{isEtf ? "ETF" : "STOCK"}</span>
                          </span>
                          <span className="truncate text-[11px] text-zinc-500">{p.asset.name}</span>
                        </div>
                        <div className="flex min-w-[90px] flex-1 flex-col gap-1">
                          <span className="font-mono text-[11px] text-zinc-500">WEIGHT <span className="ml-1 text-[13px] font-semibold text-zinc-100">{p.weight}%</span></span>
                          <div className="h-1.5 w-full overflow-hidden rounded-none bg-white/[0.06]"><div className="h-full rounded-none" style={{ width: `${p.weight}%`, background: color }} /></div>
                        </div>
                        <span className="hidden w-[80px] text-right font-mono text-[13px] text-zinc-200 md:block xl:hidden 2xl:block">${p.asset.price.toFixed(2)}</span>
                        <span className={`w-[70px] flex-none rounded-sm px-1.5 py-0.5 text-center font-mono text-[11.5px] font-bold ${p.asset.chg1d >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>{fmtP(p.asset.chg1d)}</span>
                        <span className={`hidden w-[78px] flex-none rounded-sm px-1.5 py-0.5 text-center font-mono text-[11.5px] font-bold sm:block ${p.asset.ytd >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>{fmtP(p.asset.ytd)}</span>
                        <span className={`w-[22px] flex-none text-right font-mono text-[13px] text-zinc-500 group-hover:text-white`} title={isEtf ? "ETF deep view" : "Stock deep dive"}>→</span>
                      </>
                    );
                    const cls = "group flex items-center gap-3.5 rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] px-3.5 py-1.5 transition-colors";
                    return (
                      <Link key={p.asset.ticker} href={isEtf ? `/etf/${p.asset.ticker}` : `/stock/${p.asset.ticker}${symOf[p.asset.ticker] && symOf[p.asset.ticker] !== p.asset.ticker ? `?y=${symOf[p.asset.ticker]}` : ""}`} className={`${cls} hover:border-white/[0.12] hover:bg-white/[0.03]`}>{body}</Link>
                    );
                  })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
            )}

            <AnimatePresence initial={false}>
              {isExpanded && pfTab === "OV" && (
                <motion.div key="deep" layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
                  <div className="flex flex-col gap-3">
                    <PortfolioPies positions={livePos} />
                    <PnlAttribution rows={attribRows} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        ) : (
          /* ── Build my portfolio (no portfolio yet, or editing) ── */
          <motion.section layout transition={{ layout: LAYOUT_SPRING }} className={`${card} flex flex-col gap-5 p-3`}>
            <div className="flex items-baseline justify-between gap-4">
              <h1 className="font-mono text-[14px] font-bold tracking-[0.16em] text-zinc-100">{saved ? "[ EDIT PORTFOLIO ]" : "[ NEW PORTFOLIO ]"}</h1>
              {saved && (
                <div className="flex gap-3 font-mono text-[11px]">
                  <button type="button" onClick={() => { setPrompt(saved.prompt); setEditing(false); }} className="text-zinc-400 hover:text-white">[ CANCEL ]</button>
                  <button type="button" onClick={resetPortfolio} className="text-rose-400/80 hover:text-rose-300">[ DELETE PORTFOLIO ]</button>
                </div>
              )}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex items-center gap-3 rounded-sm border border-white/[0.06] bg-[var(--oasis-bg)] py-2 pl-4 pr-2 focus-within:border-white/[0.14]">
              <span className="font-mono text-[12px] text-zinc-600">$</span>
              <input
                ref={inputRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                spellCheck={false}
                placeholder="np. VOO QQQ NVDA 40/40/20"
                className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600"
              />
              <button
                type="submit"
                disabled={!parsed.valid}
                className="flex items-center gap-2 rounded-sm bg-red-500 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-zinc-600"
              >
                {saved ? "Save" : "Run"} <span className="rounded bg-[var(--oasis-bg)] px-1 font-mono text-[10px]">↵</span>
              </button>
            </form>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-[3px] flex-1 gap-[2px] overflow-hidden rounded-none bg-white/[0.04]">
                  {livePos.map((p, i) => (
                    <div key={p.asset.ticker} className="h-full transition-[width] duration-300" style={{ width: `${(p.weight / Math.max(100, parsed.total)) * 100}%`, background: SEG_COLORS[i % SEG_COLORS.length] }} />
                  ))}
                </div>
                <span className={`flex-none font-mono text-[10px] font-bold tracking-[0.1em] ${parsed.valid ? "text-emerald-400" : "text-amber-400"}`}>
                  ■ {parsed.valid ? "100% VALIDATED" : livePos.length ? `${parsed.total.toFixed(0)}% · CHECK INPUT` : "WAITING FOR INPUT"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {livePos.map((p, i) => (
                  <span key={p.asset.ticker} className="flex items-center gap-1.5 rounded border border-white/[0.06] bg-[var(--oasis-bg)] px-2 py-1 font-mono text-[10.5px] text-zinc-500">
                    <span style={{ color: SEG_COLORS[i % SEG_COLORS.length] }}>■</span>[
                    <span className="font-bold text-zinc-100">{p.asset.ticker}</span>:
                    <span className="max-w-[180px] truncate">{p.asset.name}</span>· {p.weight}% ]
                  </span>
                ))}
              </div>
              {parsed.errors.length > 0 && <p className="font-mono text-[11px] text-amber-400">⚠ {parsed.errors.join(" · ")}</p>}
            </div>

            {importing && !showMine && <XtbImport onImport={importXtb} onClose={() => setImporting(false)} />}

            <div className="flex flex-wrap justify-end gap-2">
              {!importing && (
                <button type="button" onClick={() => setImporting(true)} className="mr-auto rounded-sm border border-white/[0.12] bg-white/[0.04] px-3 py-1 font-mono text-[11px] tracking-[0.06em] text-zinc-200 transition-colors hover:bg-white/[0.1] hover:text-white">
                  [ IMPORT FROM XTB SCREENSHOT ]
                </button>
              )}
              {([["VOO QQQ NVDA", PRESETS.classic], ["retire 2045", PRESETS.retire2045], ["Clone Dalio", PRESETS.dalio]] as const).map(([l, p]) => (
                <button key={l} type="button" onClick={() => applyPrompt(p)} className="rounded-none border border-white/[0.06] bg-white/[0.03] px-3 py-1 font-mono text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white">
                  {l}
                </button>
              ))}
            </div>
          </motion.section>
        )}

        {/* ── Bottom cards: tumble off-screen in deep view, spring back on return ── */}
        <div className={`relative grid grid-cols-1 gap-3 lg:grid-cols-2 ${isDeep ? "" : "flex-1"}`}>
          <AnimatePresence mode="popLayout" initial={false}>
            {!isDeep &&
              bottomCards.map((content, i) => (
                <motion.section
                  key={i}
                  layout
                  custom={i}
                  variants={variants}
                  initial="enter"
                  animate="show"
                  exit="fall"
                  style={{ transformOrigin: i === 0 ? "70% 30%" : i === 2 ? "30% 30%" : "50% 30%", willChange: "transform, opacity" }}
                  className={`${card} flex flex-col gap-4 p-3 xl:gap-3 xl:p-5`}
                >
                  {content}
                </motion.section>
              ))}
          </AnimatePresence>
        </div>
        </div>
      </LayoutGroup>
    </div>
  );
}
