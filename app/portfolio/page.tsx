"use client";

import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import PortfolioDeepView, { SEG_COLORS } from "@/components/PortfolioDeepView";
import PortfolioPerformance from "@/components/PortfolioPerformance";
import {
  PRESETS,
  assetClass,
  clearPortfolio,
  loadPortfolio,
  parsePortfolio,
  roastPortfolio,
  savePortfolio,
  scenarioLoss,
  type Position,
  type SavedPortfolio,
} from "@/lib/portfolio";

/* ───────────────────────────── Theme ───────────────────────────── */

const card = "rounded-2xl border border-white/[0.04] bg-[#0a0a0c]";
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
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04] transition-all duration-300 ease-out group-hover/alloc:h-4">
        {positions.map((p, i) => {
          const color = SEG_COLORS[i % SEG_COLORS.length];
          return (
            <div
              key={p.asset.ticker}
              title={`${p.asset.ticker} · ${p.weight}%`}
              className="relative flex h-full min-w-0 items-center justify-center border-r border-[#0a0a0c] transition-[filter] duration-200 last:border-r-0 hover:brightness-125"
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

function Gauge({ score }: { score: number }) {
  const r = 34, c = 2 * Math.PI * r, arc = c * 0.75; // 270° arc, open at the bottom
  return (
    <div className="relative h-[92px] w-[92px] flex-none">
      <svg viewBox="0 0 92 92" className="h-full w-full -rotate-[225deg]">
        <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
        <circle cx="46" cy="46" r={r} fill="none" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(arc * score) / 100} ${c}`} className="transition-[stroke-dasharray] duration-500" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[28px] font-medium leading-none text-white">{score}</span>
        <span className="mt-1 font-mono text-[9px] text-zinc-600">/ 100</span>
      </div>
    </div>
  );
}

function MeterBar({ title, pct, display }: { title: string; pct: number; display: string }) {
  return (
    <div className="flex flex-col gap-2 border-t border-white/[0.04] pt-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-zinc-300">{title}</span>
        <span className="font-mono text-[13px] font-semibold text-zinc-100">{display}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-red-500 transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
      </div>
    </div>
  );
}

const ghostBtn = "rounded-lg border border-white/[0.1] px-3 py-1.5 text-[12px] font-semibold text-zinc-100 transition-colors hover:bg-white/[0.06]";

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
  const [view, setView] = useState<View>("overview");
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
  const roast = useMemo(() => roastPortfolio(parsed.positions), [parsed]);
  const preset = BUILD_PRESETS.find((b) => b.id === presetId)!;

  /* Headline money metrics for the model account. */
  const todayPct = parsed.positions.reduce((a, p) => a + (p.weight / 100) * p.asset.chg1d, 0);
  const ytdPct = parsed.positions.reduce((a, p) => a + (p.weight / 100) * p.asset.ytd, 0);
  const allTimePct = parsed.positions.reduce((a, p) => a + (p.weight / 100) * allTimeOf(p.asset.ytd), 0);
  const todayUsd = (MODEL_BALANCE * todayPct) / 100;

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

  const resetPortfolio = () => {
    clearPortfolio();
    setSaved(null);
    setEditing(false);
    setView("overview");
    setExpanded(false);
    setPrompt(PRESETS.classic);
  };


  const tickers = parsed.positions.map((p) => p.asset.ticker).join(" · ");
  const roastQuestion = `Zrób roast mojego portfela: ${parsed.positions.map((p) => `${p.asset.ticker} ${p.weight}%`).join(", ")}. Oceń dywersyfikację, nakładanie się funduszy i ryzyko.`;

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
        <span className={`${label} flex items-center gap-2 text-zinc-300`}><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />BUILDER</span>
        <span className="font-mono text-[10px] text-zinc-600">4 presets · model</span>
      </div>
      <div>
        <h2 className="text-[17px] font-semibold text-zinc-50">Build from scratch</h2>
        <p className="mt-1 text-[12.5px] text-zinc-500">Pick a risk profile and preview how it would have held up.</p>
      </div>

      {/* Preset picker */}
      <div className="grid grid-cols-2 gap-2">
        {BUILD_PRESETS.map((b) => {
          const on = b.id === presetId;
          const hot = b.id === "max";
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => { setPresetId(b.id); setComparing(false); }}
              className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                on
                  ? hot ? "border-red-500/50 bg-red-500/[0.08]" : "border-emerald-400/40 bg-emerald-400/[0.06]"
                  : "border-white/[0.05] bg-[#030303]/60 hover:border-white/[0.12]"
              }`}
            >
              <span className={`font-mono text-[11px] font-bold tracking-[0.08em] ${on ? (hot ? "text-red-300" : "text-emerald-300") : "text-zinc-300"}`}>{b.name}</span>
              <span className="font-mono text-[9.5px] tracking-[0.08em] text-zinc-500">{b.tag}</span>
            </button>
          );
        })}
      </div>

      {/* Allocation of the preset */}
      <div className="flex flex-col gap-2">
        <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
          <div className="bg-emerald-400 transition-[width] duration-300" style={{ width: `${preset.core}%` }} />
          <div className="bg-violet-400 transition-[width] duration-300" style={{ width: `${preset.thematic}%` }} />
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
        <div className="flex flex-col rounded-lg border border-white/[0.05] bg-[#030303]/60">
          <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] gap-2 border-b border-white/[0.05] px-3 py-2 font-mono text-[9.5px] tracking-[0.12em] text-zinc-600">
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
        <div className="flex flex-col gap-3 rounded-lg border border-white/[0.05] bg-[#030303]/60 p-3">
          <div className="flex items-baseline justify-between">
            <span className={label}>3Y ANNUALIZED RETURN</span>
            <span className="font-mono text-[22px] font-semibold tabular-nums text-emerald-400">+{preset.cagr.toFixed(1)}%<span className="ml-1 text-[11px] text-emerald-400/70">CAGR</span></span>
          </div>
          {([["2022 Drawdown Replay", preset.dd2022], ["2020 Flash Crash", preset.crash2020]] as const).map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="text-[12px] text-zinc-400">{k}</span>
                <span className="font-mono text-[12px] font-semibold tabular-nums text-rose-400">{v.toFixed(1)}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.05]">
                <div className="h-full rounded-full bg-rose-500/80 transition-[width] duration-300" style={{ width: `${Math.min(100, Math.abs(v) * 2)}%` }} />
              </div>
            </div>
          ))}
          <span className="font-mono text-[9px] tracking-[0.1em] text-zinc-600">MODEL BACKTEST · PLACEHOLDER DATA</span>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.05] pt-4">
        <button type="button" onClick={() => applyPrompt(preset.prompt)} className="font-mono text-[11px] tracking-[0.06em] text-zinc-500 transition-colors hover:text-white" title={preset.prompt}>
          Use preset
        </button>
        <button
          type="button"
          disabled={!mine}
          onClick={() => setComparing((c) => !c)}
          title={mine ? undefined : "Build your portfolio first"}
          className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-100 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {comparing ? "← Back to preset" : "Compare with my portfolio →"}
        </button>
      </div>
    </>,

    /* Whales */
    <>
      <div className="flex items-baseline justify-between">
        <span className={`${label} flex items-center gap-2 text-zinc-300`}><span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />WHALES</span>
        <span className="font-mono text-[10px] text-zinc-600">13F · Q2 2026</span>
      </div>
      <div>
        <h2 className="text-[17px] font-semibold text-zinc-50">Clone smart money</h2>
        <p className="mt-1 text-[12.5px] text-zinc-500">Latest filings. Clone the proportions in one click.</p>
      </div>
      <div className="flex flex-col">
        <div className="grid grid-cols-[minmax(0,1fr)_56px_64px_56px] gap-2 border-b border-white/[0.04] pb-2 font-mono text-[9.5px] tracking-[0.12em] text-zinc-600">
          <span>ENTITY</span><span>MOVE</span><span className="text-right">Q/Q</span><span className="text-right">ALLOC</span>
        </div>
        {WHALES.map((w) => (
          <button
            key={w.name}
            type="button"
            onClick={() => applyPrompt(w.prompt)}
            title={`Clone: ${w.prompt}`}
            className="group grid grid-cols-[minmax(0,1fr)_56px_64px_56px] items-center gap-2 border-b border-white/[0.04] py-2.5 text-left transition-colors hover:bg-white/[0.02]"
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
        Explore gurus →
      </Link>
    </>,

    /* Live roast */
    <>
      <div className="flex items-baseline justify-between">
        <span className={`${label} text-zinc-300`}>LIVE PORTFOLIO ROAST</span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />Live</span>
      </div>
      <div className="flex items-center gap-6">
        <Gauge score={roast.score} />
        <div className="flex min-w-0 flex-col gap-2">
          <span className="truncate font-mono text-[12px] text-zinc-400">{tickers || "—"}</span>
          <span className="self-start rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-red-400">{roast.tier}</span>
          {roast.nextTier && <span className="font-mono text-[11px] text-zinc-500"><span className="text-zinc-200">+{roast.toNext}</span> to {roast.nextTier}</span>}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <MeterBar title={`Overlap ${roast.overlap.pair}`} pct={roast.overlap.pct} display={`${roast.overlap.pct.toFixed(1)}%`} />
        <MeterBar title="Top-10 concentration" pct={roast.top10} display={`${roast.top10.toFixed(1)}%`} />
        <MeterBar title="2022 drawdown replay" pct={Math.abs(roast.drawdown)} display={`${roast.drawdown.toFixed(1)}%`} />
      </div>
      <Link
        href={`/chat?q=${encodeURIComponent(roastQuestion)}`}
        className={`${ghostBtn} mt-auto self-start ${parsed.positions.length ? "" : "pointer-events-none opacity-40"}`}
      >
        Roast mine <span className="text-red-400">→</span>
      </Link>
    </>,
  ];

  return (
    // flex-none: the page grows with its content (never squeezed to the viewport);
    // falling cards are clipped by <main> while its scroll is locked during the transition.
    <div className="relative mx-auto flex min-h-full w-full max-w-[1560px] flex-none flex-col gap-5 overflow-x-clip bg-[#030303] px-6 pb-10 pt-5">
      <motion.div layout="position" className="font-mono text-[10px] tracking-[0.14em] text-zinc-600">
        [ DASHBOARD / <span className={isDeep ? "" : "text-zinc-300"}>PORTFOLIO</span>
        {isDeep && <> / <span className="text-zinc-300">DEEP VIEW</span></>} ]
      </motion.div>

      <LayoutGroup>
        {!loaded ? (
          <section className={`${card} h-[300px] animate-pulse`} />
        ) : showMine ? (
          /* ── My portfolio: compact (overview) ⇄ expanded (deep-view) ── */
          <motion.section
            layout
            transition={{ layout: reduceMotion ? { duration: 0 } : LAYOUT_SPRING }}
            onClick={onCardClick}
            className={`${card} flex flex-none flex-col gap-6 p-7 ${isExpanded ? "min-h-[calc(100dvh-230px)]" : isDeep ? "" : "cursor-pointer transition-colors hover:border-white/[0.09]"}`}
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
                      className="self-start rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white"
                    >
                      ← Back to Overview
                    </motion.button>
                  )}
                </AnimatePresence>
                <div>
                  <h1 className="text-[30px] font-semibold tracking-tight text-zinc-50">
                    My portfolio{isDeep && <span className="ml-3 align-middle font-mono text-[12px] font-bold tracking-[0.14em] text-red-400">DEEP VIEW</span>}
                  </h1>
                  <p className="mt-1 font-mono text-[11px] text-zinc-500">
                    {parsed.positions.length} positions · created {new Date(saved!.createdAt).toLocaleDateString("pl-PL")} · <span className="text-zinc-400">{saved!.prompt}</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {isDeep ? (
                  <Link href="/portfolio/holdings" className={ghostBtn}>Holdings table →</Link>
                ) : (
                  <>
                    <button type="button" onClick={() => setEditing(true)} className={ghostBtn}>Edit</button>
                    <button type="button" onClick={goDeep} className="rounded-lg bg-red-500 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-red-400">
                      Full analysis →
                    </button>
                  </>
                )}
              </div>
            </motion.div>

            <motion.div layout="position" className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {([
                { k: "TODAY P&L", v: fmtP(todayPct), sub: (todayUsd >= 0 ? "+" : "") + usd(todayUsd), tone: todayPct >= 0 ? "up" : "down" },
                { k: "YTD RETURN", v: fmtP(ytdPct), sub: "since Jan 1", tone: ytdPct >= 0 ? "up" : "down" },
                { k: "TOTAL BALANCE", v: usd(MODEL_BALANCE, 2), sub: "model account", tone: "flat" },
                { k: "ALL-TIME GAIN", v: (allTimePct >= 0 ? "+" : "") + allTimePct.toFixed(1) + "%", sub: (allTimePct >= 0 ? "+" : "") + usd(MODEL_BALANCE - MODEL_BALANCE / (1 + allTimePct / 100)), tone: allTimePct >= 0 ? "up" : "down" },
              ] as const).map((m) => (
                <div key={m.k} className="rounded-xl border border-white/[0.05] bg-[#030303]/60 px-4 py-3">
                  <div className={label}>{m.k}</div>
                  <div className={`mt-1 font-mono text-[20px] font-semibold tabular-nums ${m.tone === "up" ? "text-emerald-400" : m.tone === "down" ? "text-rose-400" : "text-zinc-50"}`}>{m.v}</div>
                  <div className={`mt-0.5 font-mono text-[11px] tabular-nums ${m.tone === "up" ? "text-emerald-400/70" : m.tone === "down" ? "text-rose-400/70" : "text-zinc-600"}`}>{m.sub}</div>
                </div>
              ))}
            </motion.div>

            <motion.div layout="position">
              <AllocationBar positions={parsed.positions} />
            </motion.div>

            <motion.div layout="position" onClick={(e) => e.stopPropagation()}>
              <PortfolioPerformance positions={parsed.positions} />
            </motion.div>

            <AnimatePresence mode="wait" initial={false}>
              {isExpanded ? (
                <motion.div key="deep" layout="position">
                  <PortfolioDeepView positions={parsed.positions} />
                </motion.div>
              ) : (
                /* Big rows — the doorway into each ETF's Deep View */
                <motion.div
                  key="rows"
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { delay: 0.15 } }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  className="flex flex-col gap-2"
                >
                  {parsed.positions.map((p, i) => {
                    const color = SEG_COLORS[i % SEG_COLORS.length];
                    const isEtf = p.asset.kind === "etf";
                    const body = (
                      <>
                        <span className="h-12 w-1 flex-none rounded-full" style={{ background: color }} />
                        <div className="flex w-[220px] min-w-0 flex-none flex-col">
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-[22px] font-bold text-zinc-50">{p.asset.ticker}</span>
                            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] text-zinc-400">{isEtf ? "ETF" : "STOCK"}</span>
                          </span>
                          <span className="truncate text-[12px] text-zinc-500">{p.asset.name}</span>
                        </div>
                        <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
                          <span className="font-mono text-[11px] text-zinc-500">WEIGHT <span className="ml-1 text-[15px] font-semibold text-zinc-100">{p.weight}%</span></span>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full" style={{ width: `${p.weight}%`, background: color }} /></div>
                        </div>
                        <span className="hidden w-[90px] text-right font-mono text-[14px] text-zinc-200 md:block">${p.asset.price.toFixed(2)}</span>
                        <span className={`w-[80px] rounded-md px-2 py-1 text-center font-mono text-[12px] font-bold ${p.asset.chg1d >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>{fmtP(p.asset.chg1d)}</span>
                        <span className={`hidden w-[86px] rounded-md px-2 py-1 text-center font-mono text-[12px] font-bold sm:block ${p.asset.ytd >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>{fmtP(p.asset.ytd)}</span>
                        <span className={`w-[110px] text-right font-mono text-[11px] tracking-[0.08em] ${isEtf ? "text-zinc-400 group-hover:text-white" : "text-zinc-700"}`}>{isEtf ? "DEEP VIEW →" : "SINGLE STOCK"}</span>
                      </>
                    );
                    const cls = "group flex items-center gap-5 rounded-xl border border-white/[0.04] bg-black/30 px-5 py-4 transition-colors";
                    return isEtf ? (
                      <Link key={p.asset.ticker} href={`/etf/${p.asset.ticker}`} className={`${cls} hover:border-white/[0.12] hover:bg-white/[0.03]`}>{body}</Link>
                    ) : (
                      <div key={p.asset.ticker} className={cls}>{body}</div>
                    );
                  })}
                  <p className="pt-1 text-center font-mono text-[10px] tracking-[0.12em] text-zinc-600">CLICK THE CARD FOR THE FULL PORTFOLIO DEEP VIEW</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        ) : (
          /* ── Build my portfolio (no portfolio yet, or editing) ── */
          <motion.section layout transition={{ layout: LAYOUT_SPRING }} className={`${card} flex flex-col gap-5 p-7`}>
            <div className="flex items-baseline justify-between gap-4">
              <h1 className="text-[30px] font-semibold tracking-tight text-zinc-50">{saved ? "Edit my portfolio" : "Build my portfolio"}</h1>
              {saved && (
                <div className="flex gap-3 font-mono text-[11px]">
                  <button type="button" onClick={() => { setPrompt(saved.prompt); setEditing(false); }} className="text-zinc-400 hover:text-white">[ CANCEL ]</button>
                  <button type="button" onClick={resetPortfolio} className="text-rose-400/80 hover:text-rose-300">[ DELETE PORTFOLIO ]</button>
                </div>
              )}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/40 py-2 pl-4 pr-2 focus-within:border-white/[0.14]">
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
                className="flex items-center gap-2 rounded-lg bg-red-500 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-zinc-600"
              >
                {saved ? "Save" : "Run"} <span className="rounded bg-black/20 px-1 font-mono text-[10px]">↵</span>
              </button>
            </form>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-[3px] flex-1 gap-[2px] overflow-hidden rounded-full bg-white/[0.04]">
                  {parsed.positions.map((p, i) => (
                    <div key={p.asset.ticker} className="h-full transition-[width] duration-300" style={{ width: `${(p.weight / Math.max(100, parsed.total)) * 100}%`, background: SEG_COLORS[i % SEG_COLORS.length] }} />
                  ))}
                </div>
                <span className={`flex-none font-mono text-[10px] font-bold tracking-[0.1em] ${parsed.valid ? "text-emerald-400" : "text-amber-400"}`}>
                  ■ {parsed.valid ? "100% VALIDATED" : parsed.positions.length ? `${parsed.total.toFixed(0)}% · CHECK INPUT` : "WAITING FOR INPUT"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {parsed.positions.map((p, i) => (
                  <span key={p.asset.ticker} className="flex items-center gap-1.5 rounded border border-white/[0.06] bg-black/30 px-2 py-1 font-mono text-[10.5px] text-zinc-500">
                    <span style={{ color: SEG_COLORS[i % SEG_COLORS.length] }}>■</span>[
                    <span className="font-bold text-zinc-100">{p.asset.ticker}</span>:
                    <span className="max-w-[180px] truncate">{p.asset.name}</span>· {p.weight}% ]
                  </span>
                ))}
              </div>
              {parsed.errors.length > 0 && <p className="font-mono text-[11px] text-amber-400">⚠ {parsed.errors.join(" · ")}</p>}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {([["VOO QQQ NVDA", PRESETS.classic], ["retire 2045", PRESETS.retire2045], ["Clone Dalio", PRESETS.dalio]] as const).map(([l, p]) => (
                <button key={l} type="button" onClick={() => applyPrompt(p)} className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 font-mono text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white">
                  {l}
                </button>
              ))}
            </div>
          </motion.section>
        )}

        {/* ── Bottom cards: tumble off-screen in deep view, spring back on return ── */}
        <div className="relative grid grid-cols-1 gap-5 lg:grid-cols-3">
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
                  className={`${card} flex flex-col gap-5 p-7`}
                >
                  {content}
                </motion.section>
              ))}
          </AnimatePresence>
        </div>
      </LayoutGroup>
    </div>
  );
}
