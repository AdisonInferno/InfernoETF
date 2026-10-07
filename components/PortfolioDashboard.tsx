"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PRESETS, clearPortfolio, loadPortfolio, parsePortfolio, roastPortfolio, savePortfolio, type SavedPortfolio } from "@/lib/portfolio";

const SEG_COLORS = ["#4ade80", "#60a5fa", "#a78bfa", "#f59e0b", "#f472b6", "#22d3ee", "#f87171", "#a3e635"];
const card = "rounded-2xl border border-white/[0.05] bg-[#121214]";
const label = "font-mono text-[10px] font-semibold tracking-[0.14em] text-zinc-500";

/* ───────────────────────────── Builder ───────────────────────────── */

const RISK_LEVELS = [
  { core: 70, thematic: 5, defensive: 25, vol: 9.2, dd: -18, prompt: "VT SCHD TLT SMH 50/25/20/5" },
  { core: 62, thematic: 15, defensive: 23, vol: 11.6, dd: -24, prompt: "VOO VT SMH SCHD TLT 40/22/15/13/10" },
  { core: 55, thematic: 25, defensive: 20, vol: 14.1, dd: -31, prompt: "VOO SMH SCHD 55/25/20" },
  { core: 45, thematic: 40, defensive: 15, vol: 18.7, dd: -39, prompt: "VOO SMH ARKK GLD 45/25/15/15" },
  { core: 30, thematic: 65, defensive: 5, vol: 26.4, dd: -52, prompt: "QQQ SMH SOXL ARKK GLD 30/30/20/15/5" },
];
const RISK_LABELS = ["SAFE", "", "RISK", "", "MAX"];

/* ───────────────────────────── Whales ───────────────────────────── */

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

/* ───────────────────────────── Gauge ───────────────────────────── */

function Gauge({ score }: { score: number }) {
  // 270° arc, opening at the bottom.
  const r = 34, c = 2 * Math.PI * r, arc = c * 0.75;
  return (
    <div className="relative h-[92px] w-[92px] flex-none">
      <svg viewBox="0 0 92 92" className="h-full w-full -rotate-[225deg]">
        <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
        <circle
          cx="46" cy="46" r={r} fill="none" stroke="#ef4444" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${(arc * score) / 100} ${c}`} className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[30px] font-medium leading-none text-white">{score}</span>
        <span className="mt-1 font-mono text-[9px] text-zinc-600">/ 100</span>
      </div>
    </div>
  );
}

function Bar({ label: l, value, pct, display }: { label: string; value: number; pct: number; display: string }) {
  return (
    <div className="flex flex-col gap-2 border-t border-white/[0.05] pt-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-zinc-300">{l}</span>
        <span className="font-mono text-[13px] font-semibold text-zinc-100">{display}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-red-500 transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
      </div>
      <span className="sr-only">{value}</span>
    </div>
  );
}

/* ───────────────────────────── Page ───────────────────────────── */

export default function PortfolioDashboard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState(PRESETS.classic);
  const [risk, setRisk] = useState(2);
  const [saved, setSaved] = useState<SavedPortfolio | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);

  // Restore the user's saved portfolio (browser storage) after mount.
  useEffect(() => {
    const p = loadPortfolio();
    if (p) { setSaved(p); setPrompt(p.prompt); }
    setLoaded(true);
  }, []);

  const showMine = loaded && saved !== null && !editing;
  const parsed = useMemo(() => parsePortfolio(prompt), [prompt]);
  const roast = useMemo(() => roastPortfolio(parsed.positions), [parsed]);
  const lvl = RISK_LEVELS[risk];

  const usePrompt = (p: string) => {
    setPrompt(p);
    setEditing(true);
    window.scrollTo({ top: 0 });
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
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
    setPrompt(PRESETS.classic);
  };

  const wavg = (f: (x: (typeof parsed.positions)[number]) => number) =>
    parsed.positions.reduce((a, p) => a + (p.weight / 100) * f(p), 0);
  const fmtP = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";

  const tickers = parsed.positions.map((p) => p.asset.ticker).join(" · ");
  const roastQuestion = `Zrób roast mojego portfela: ${parsed.positions.map((p) => `${p.asset.ticker} ${p.weight}%`).join(", ")}. Oceń dywersyfikację, nakładanie się funduszy i ryzyko.`;

  return (
    <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-5 px-6 pb-10 pt-5">
      <div className="font-mono text-[10px] tracking-[0.14em] text-zinc-600">
        [ DASHBOARD / <span className="text-zinc-300">PORTFOLIO</span> ]
      </div>

      {!loaded ? (
        <section className={`${card} h-[300px] animate-pulse`} />
      ) : showMine ? (
        /* ── My Portfolio (after the user built one) ── */
        <section className={`${card} flex flex-col gap-6 p-7`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[30px] font-semibold tracking-tight text-zinc-50">My portfolio</h1>
              <p className="mt-1 font-mono text-[11px] text-zinc-500">
                {parsed.positions.length} positions · created {new Date(saved!.createdAt).toLocaleDateString("pl-PL")} · <span className="text-zinc-400">{saved!.prompt}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-[12px] font-semibold text-zinc-100 transition-colors hover:bg-white/[0.06]">Edit</button>
              <Link href="/portfolio/holdings" className="rounded-lg bg-red-500 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-red-400">Full analysis →</Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["TODAY", fmtP(wavg((p) => p.asset.chg1d)), wavg((p) => p.asset.chg1d) >= 0],
              ["YTD", fmtP(wavg((p) => p.asset.ytd)), wavg((p) => p.asset.ytd) >= 0],
              ["2022 REPLAY", roast.drawdown.toFixed(1) + "%", false],
              ["ROAST", `${roast.score} · ${roast.tier}`, null],
            ].map(([k, v, up]) => (
              <div key={k as string} className="rounded-xl border border-white/[0.04] bg-black/30 px-4 py-3">
                <div className={label}>{k}</div>
                <div className={`mt-1 font-mono text-[18px] font-semibold ${up === null ? "text-zinc-100" : up ? "text-emerald-400" : "text-rose-400"}`}>{v}</div>
              </div>
            ))}
          </div>

          <div className="flex h-[3px] gap-[2px] overflow-hidden rounded-full">
            {parsed.positions.map((p, i) => (
              <div key={p.asset.ticker} style={{ width: `${p.weight}%`, background: SEG_COLORS[i % SEG_COLORS.length] }} />
            ))}
          </div>

          {/* Big rows — the doorway into each Deep View */}
          <div className="flex flex-col gap-2">
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
                  <span className={`w-[110px] text-right font-mono text-[11px] tracking-[0.08em] ${isEtf ? "text-zinc-400 group-hover:text-white" : "text-zinc-700"}`}>
                    {isEtf ? "DEEP VIEW →" : "SINGLE STOCK"}
                  </span>
                </>
              );
              const cls = "group flex items-center gap-5 rounded-xl border border-white/[0.04] bg-black/30 px-5 py-4 transition-colors";
              return isEtf ? (
                <Link key={p.asset.ticker} href={`/etf/${p.asset.ticker}`} className={`${cls} hover:border-white/[0.12] hover:bg-white/[0.03]`}>{body}</Link>
              ) : (
                <div key={p.asset.ticker} className={cls}>{body}</div>
              );
            })}
          </div>
        </section>
      ) : (
      /* ── Build my portfolio (no portfolio yet, or editing) ── */
      <section className={`${card} flex flex-col gap-5 p-7`}>
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-[30px] font-semibold tracking-tight text-zinc-50">{saved ? "Edit my portfolio" : "Build my portfolio"}</h1>
          {saved && (
            <div className="flex gap-3 font-mono text-[11px]">
              <button type="button" onClick={() => { setPrompt(saved.prompt); setEditing(false); }} className="text-zinc-400 hover:text-white">[ CANCEL ]</button>
              <button type="button" onClick={resetPortfolio} className="text-rose-400/80 hover:text-rose-300">[ DELETE PORTFOLIO ]</button>
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); run(); }}
          className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/40 py-2 pl-4 pr-2 focus-within:border-white/[0.14]"
        >
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

        {/* Allocation bar */}
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
          {[
            ["VOO QQQ NVDA", PRESETS.classic],
            ["retire 2045", PRESETS.retire2045],
            ["Clone Dalio", PRESETS.dalio],
          ].map(([l, p]) => (
            <button key={l} type="button" onClick={() => usePrompt(p)} className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 font-mono text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white">
              {l}
            </button>
          ))}
        </div>
      </section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ── Builder ── */}
        <section className={`${card} flex flex-col gap-5 p-7`}>
          <div className="flex items-baseline justify-between">
            <span className={`${label} flex items-center gap-2 text-zinc-300`}><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />BUILDER</span>
            <span className="font-mono text-[10px] text-zinc-600">5 risk levels · live</span>
          </div>
          <div>
            <h2 className="text-[17px] font-semibold text-zinc-50">Build from scratch</h2>
            <p className="mt-1 text-[12.5px] text-zinc-500">Set a risk level. The allocation rebuilds live.</p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-5 gap-1.5">
              {RISK_LEVELS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Risk level ${i + 1}`}
                  onClick={() => setRisk(i)}
                  className={`h-2 rounded-full transition-colors ${i <= risk ? (i === risk ? "bg-emerald-400" : "bg-emerald-600/70") : "bg-white/[0.08] hover:bg-white/[0.16]"}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-5 text-center font-mono text-[9.5px] tracking-[0.1em]">
              {RISK_LABELS.map((l, i) => (
                <span key={i} className={i === risk ? "text-zinc-100" : "text-zinc-600"}>{l || "·"}</span>
              ))}
            </div>
          </div>

          <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full">
            <div className="bg-emerald-400 transition-[width] duration-300" style={{ width: `${lvl.core}%` }} />
            <div className="bg-emerald-600 transition-[width] duration-300" style={{ width: `${lvl.thematic}%` }} />
            <div className="bg-emerald-900 transition-[width] duration-300" style={{ width: `${lvl.defensive}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[["CORE", lvl.core], ["THEMATIC", lvl.thematic], ["DEFENSIVE", lvl.defensive]].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1">
                <span className={label}>{k}</span>
                <span className="font-mono text-[15px] font-semibold text-zinc-100">{v}%</span>
              </div>
            ))}
          </div>
          <div className="flex gap-5 border-t border-white/[0.05] pt-3 font-mono text-[11px]">
            <span className="text-zinc-500">VOL <span className="ml-1 text-zinc-200">{lvl.vol.toFixed(1)}%</span></span>
            <span className="text-zinc-500">MAX DD <span className="ml-1 text-rose-400">{lvl.dd}%</span></span>
          </div>
          <div className="font-mono text-[10.5px] text-zinc-600">→ {lvl.prompt}</div>

          <button type="button" onClick={() => usePrompt(lvl.prompt)} className="mt-auto self-start rounded-lg border border-white/[0.1] px-3 py-1.5 text-[12px] font-semibold text-zinc-100 transition-colors hover:bg-white/[0.06]">
            Launch builder →
          </button>
        </section>

        {/* ── Whales ── */}
        <section className={`${card} flex flex-col gap-5 p-7`}>
          <div className="flex items-baseline justify-between">
            <span className={`${label} flex items-center gap-2 text-zinc-300`}><span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />WHALES</span>
            <span className="font-mono text-[10px] text-zinc-600">13F · Q2 2026</span>
          </div>
          <div>
            <h2 className="text-[17px] font-semibold text-zinc-50">Clone smart money</h2>
            <p className="mt-1 text-[12.5px] text-zinc-500">Latest filings. Clone the proportions in one click.</p>
          </div>

          <div className="flex flex-col">
            <div className="grid grid-cols-[minmax(0,1fr)_56px_64px_56px] gap-2 border-b border-white/[0.05] pb-2 font-mono text-[9.5px] tracking-[0.12em] text-zinc-600">
              <span>ENTITY</span><span>MOVE</span><span className="text-right">Q/Q</span><span className="text-right">ALLOC</span>
            </div>
            {WHALES.map((w) => (
              <button
                key={w.name}
                type="button"
                onClick={() => usePrompt(w.prompt)}
                title={`Clone: ${w.prompt}`}
                className="group grid grid-cols-[minmax(0,1fr)_56px_64px_56px] items-center gap-2 border-b border-white/[0.05] py-2.5 text-left transition-colors hover:bg-white/[0.02]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-zinc-100">{w.name}</span>
                  <span className="block truncate text-[11px] text-zinc-500">
                    <span className="group-hover:hidden">{w.sub}</span>
                    <span className="hidden text-emerald-400 group-hover:inline">Clone → {w.prompt}</span>
                  </span>
                </span>
                <span className={`justify-self-start rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold ${MOVE_STYLE[w.move]}`}>{w.move}</span>
                <span className={`text-right font-mono text-[12px] ${w.qq > 0 ? "text-emerald-400" : w.qq < 0 ? "text-rose-400" : "text-zinc-500"}`}>
                  {w.qq > 0 ? "+" : ""}{w.qq.toFixed(1)}%
                </span>
                <span className="text-right font-mono text-[12px] font-semibold text-zinc-100">{w.alloc}</span>
              </button>
            ))}
          </div>

          <Link
            href={`/chat?q=${encodeURIComponent("Pokaż mi portfele największych inwestorów (Buffett, Dalio, BlackRock) i jak odwzorować je ETF-ami.")}`}
            className="mt-auto self-start rounded-lg border border-white/[0.1] px-3 py-1.5 text-[12px] font-semibold text-zinc-100 transition-colors hover:bg-white/[0.06]"
          >
            Explore gurus →
          </Link>
        </section>

        {/* ── Live roast ── */}
        <section className={`${card} flex flex-col gap-5 p-7`}>
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
            <Bar label={`Overlap ${roast.overlap.pair}`} value={roast.overlap.pct} pct={roast.overlap.pct} display={`${roast.overlap.pct.toFixed(1)}%`} />
            <Bar label="Top-10 concentration" value={roast.top10} pct={roast.top10} display={`${roast.top10.toFixed(1)}%`} />
            <Bar label="2022 drawdown replay" value={roast.drawdown} pct={Math.abs(roast.drawdown)} display={`${roast.drawdown.toFixed(1)}%`} />
          </div>

          <Link
            href={`/chat?q=${encodeURIComponent(roastQuestion)}`}
            className={`mt-auto self-start rounded-lg border border-white/[0.1] px-3 py-1.5 text-[12px] font-semibold text-zinc-100 transition-colors hover:bg-white/[0.06] ${parsed.positions.length ? "" : "pointer-events-none opacity-40"}`}
          >
            Roast mine <span className="text-red-400">→</span>
          </Link>
        </section>
      </div>

      <div className={`flex justify-end ${showMine ? "hidden" : ""}`}>
        <Link href="/portfolio/holdings" className="font-mono text-[11px] tracking-[0.1em] text-zinc-500 hover:text-white">
          [ MY HOLDINGS → ]
        </Link>
      </div>
    </div>
  );
}
