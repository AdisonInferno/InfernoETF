"use client";

import Link from "next/link";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import ResizableSplit from "@/components/ResizableSplit";
import { ETFS, fmtAum } from "@/lib/etfs";
import { QUOTE } from "@/lib/fund-profiles";
import { drillDown, loadLots, lookThrough, saveLots, sectorExposure, type Lot, type Position } from "@/lib/portfolio";
import { TABLE_TFS, type Live, type PTf } from "@/lib/portfolio-live";

export const SEG_COLORS = ["#4ade80", "#60a5fa", "#94a3b8", "#f59e0b", "#f472b6", "#22d3ee", "#f87171", "#a3e635"];
const panel = "rounded-sm border border-white/[0.06] bg-[#030303] p-3";
const label = "font-mono text-[10px] font-semibold tracking-[0.14em] text-zinc-500";
const pct = (v: number, d = 1) => (v >= 0 ? "+" : "") + v.toFixed(d) + "%";

/* Staggered reveal for the analytics blocks once the card has expanded. */
const reveal: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.25 + i * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } }),
};

/* ───────────────────── Shared: close (X) button ───────────────────── */

function CloseBtn({ onClick, title }: { onClick?: () => void; title: string }) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Hide ${title}`}
      aria-label={`Hide ${title}`}
      className="flex h-6 w-6 flex-none items-center justify-center rounded-sm text-zinc-600 transition-colors hover:bg-white/[0.08] hover:text-white"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.6"><path d="M1 1l8 8M9 1L1 9" /></svg>
    </button>
  );
}

/* ───────────────────── Sector overlap breakdown ───────────────────── */

export function SectorOverlap({ positions, onClose }: { positions: Position[]; onClose?: () => void }) {
  const rows = useMemo(() => sectorExposure(positions).slice(0, 9), [positions]);
  const max = Math.max(...rows.map((r) => r.total), 1);
  const colorOf = (t: string) => SEG_COLORS[positions.findIndex((p) => p.asset.ticker === t) % SEG_COLORS.length];

  return (
    <div className={`${panel} flex h-full min-w-0 flex-col gap-4`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`${label} truncate text-zinc-300`}>SECTOR OVERLAP BREAKDOWN</span>
        <div className="flex min-w-0 items-center gap-2">
          <CloseBtn onClick={onClose} title="Sector Overlap Breakdown" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          return (
            <div key={r.sector} className="grid grid-cols-[minmax(80px,130px)_minmax(0,1fr)_52px] items-center gap-3">
              <span className="truncate text-[12.5px] text-zinc-300">{r.sector}</span>
              <div className="flex h-2.5 overflow-hidden rounded-sm bg-white/[0.04]" style={{ width: `${(r.total / max) * 100}%` }}>
                {Object.entries(r.by).sort((a, b) => b[1] - a[1]).map(([t, v]) => (
                  <div key={t} title={`${t}: ${v.toFixed(1)}%`} style={{ width: `${(v / r.total) * 100}%`, background: colorOf(t) }} className="h-full border-r border-[#0a0a0c] last:border-r-0" />
                ))}
              </div>
              <span className="text-right font-mono text-[12px] font-semibold text-zinc-100">{r.total.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 border-t border-white/[0.06] pt-3">
        {positions.map((p, i) => (
          <span key={p.asset.ticker} className="flex items-center gap-1.5 font-mono text-[10.5px] text-zinc-400">
            <span className="h-2 w-2 rounded-sm" style={{ background: SEG_COLORS[i % SEG_COLORS.length] }} />{p.asset.ticker}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────── ETFs in the portfolio (+ look-through) ───────────────────── */

const NOTIONAL = 124_580; // same model account as the page header
/** Everything in the portfolio is shown in US dollars. */
const money = (v: number) => (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signMoney = (v: number) => (v > 0 ? "+" : "") + money(v);
const tone = (v: number) => (v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-300");
const qtyFmt = (q: number) => q.toLocaleString("en-US", { maximumFractionDigits: 4 });

/** Default lot when the user hasn't entered one: the model account split by target weight, bought on Jan 1 (price before YTD move). */
const defaultLot = (p: Position): Lot => ({
  qty: +((NOTIONAL * p.weight) / 100 / p.asset.price).toFixed(4),
  avg: +(p.asset.price / (1 + p.asset.ytd / 100)).toFixed(2),
});

export function useLots() {
  const [lots, setLots] = useState<Record<string, Lot>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from browser storage
    setLots(loadLots());
  }, []);
  const save = (ticker: string, lot: Lot | null) =>
    setLots((cur) => {
      const next = { ...cur };
      if (lot) next[ticker] = lot; else delete next[ticker];
      saveLots(next);
      return next;
    });
  /** replace every lot (after an import) */
  const setAll = (next: Record<string, Lot>) => { saveLots(next); setLots(next); };
  return { lots, save, setAll };
}

/** Inline editor for quantity + average price (XTB-style "open position"), in the instrument's own currency. */
function LotEditor({ lot, custom, ccy, onSave }: { lot: Lot; custom: boolean; ccy: string; onSave: (l: Lot | null) => void }) {
  const [qty, setQty] = useState(String(lot.qty));
  const [avg, setAvg] = useState(String(lot.avg));
  const q = Number(qty.replace(",", ".")), a = Number(avg.replace(",", "."));
  const ok = q > 0 && a > 0;
  const input = "h-8 w-28 rounded-sm border border-white/[0.08] bg-[#030303] px-2 font-mono text-[12px] text-zinc-100 outline-none focus:border-white/[0.2]";
  return (
    <div className="flex flex-wrap items-end gap-3 px-4 pb-3 pt-3">
      <label className="flex flex-col gap-1"><span className={label}>SHARES</span><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" className={input} /></label>
      <label className="flex flex-col gap-1"><span className={label}>AVG BUY PRICE · {ccy}</span><input value={avg} onChange={(e) => setAvg(e.target.value)} inputMode="decimal" className={input} /></label>
      <button type="button" disabled={!ok} onClick={() => onSave({ ...lot, qty: q, avg: a, value: undefined, pl: undefined })} className="h-8 rounded-sm border border-white/[0.12] px-3 font-mono text-[10.5px] tracking-[0.1em] text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40">[ SAVE ]</button>
      {custom && <button type="button" onClick={() => onSave(null)} className="h-8 px-1 font-mono text-[10.5px] tracking-[0.1em] text-zinc-500 hover:text-white">[ RESET ]</button>}
    </div>
  );
}

const terFmt = (ter: number) => `${ter.toFixed(Math.abs(ter * 100 - Math.round(ter * 100)) > 1e-6 ? 4 : 2)}%`;
const normTic = (t: string) => (t === "GOOG" ? "GOOGL" : t);

/** One position's underlying stocks, share classes merged (GOOG + GOOGL → GOOGL). */
function lookRows(p: Position, n: number) {
  const m = new Map<string, { ticker: string; name: string; inFund: number; inPortfolio: number }>();
  for (const r of drillDown(p, 500)) {
    const k = normTic(r.ticker), cur = m.get(k);
    if (cur) { cur.inFund += r.inFund; cur.inPortfolio += r.inPortfolio; cur.name = cur.name.replace(/ Class [AC]$/, ""); }
    else m.set(k, { ...r, ticker: k });
  }
  return [...m.values()].sort((a, b) => b.inFund - a.inFund).slice(0, n);
}

type SortKey = "name" | "qty" | "avg" | "price" | "value" | "pl" | "ret" | "weight";
type KindFilter = "ALL" | "ETF" | "STOCK" | "UP" | "DOWN";

export function OpenPositions({ positions, lots, saveLot, live, fx, tf, onTfChange, rets, onClose }: {
  positions: Position[];
  lots: Record<string, Lot>;
  saveLot: (ticker: string, lot: Lot | null) => void;
  live: Record<string, Live>;
  /** USD per unit of currency */
  fx: Record<string, number>;
  tf: PTf;
  onTfChange: (t: PTf) => void;
  /** % return per ticker over `tf` (null while loading) */
  rets: Record<string, number> | null;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "value", dir: -1 });
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<KindFilter>("ALL");
  /** Total look-through weight of every stock across the whole portfolio, % */
  const total = useMemo(() => lookThrough(positions), [positions]);
  /** How many positions hold each stock */
  const holders = useMemo(() => {
    const n: Record<string, number> = {};
    positions.forEach((p) => lookRows(p, 500).forEach((r) => { n[r.ticker] = (n[r.ticker] ?? 0) + 1; }));
    return n;
  }, [positions]);

  const usdOf = (c?: string) => (c ? fx[c] : 1);
  const base = positions.map((p, i) => {
    const etf = ETFS.find((e) => e.ticker === p.asset.ticker);
    const ter = etf ? QUOTE[p.asset.ticker]?.[1] ?? 0 : 0;
    const custom = !!lots[p.asset.ticker];
    const lot = lots[p.asset.ticker] ?? defaultLot(p);
    const lv = live[p.asset.ticker];
    const acct = lot.ccy ?? "USD", acctFx = usdOf(acct);
    // Instrument currency: from the live quote; without one, an imported price is in an unknown currency.
    const ccy = lv?.currency ?? (lot.price != null && acct !== "USD" ? "?" : "USD");
    const insFx = ccy === "?" ? undefined : usdOf(ccy);
    // Price in USD: live quote → broker value / shares (account ccy → USD) → our own quote.
    const price = lv && insFx ? lv.price * insFx
      : lot.value != null && acctFx && lot.qty ? (lot.value * acctFx) / lot.qty
      : (lot.price ?? p.asset.price) * (insFx ?? 1);
    const value = lot.qty * price;
    // Cost in USD: broker figures (value − P&L, account ccy) when imported, else shares × avg price.
    const cost = lot.pl != null && lot.value != null && acctFx ? (lot.value - lot.pl) * acctFx : lot.qty * lot.avg * (insFx ?? acctFx ?? 1);
    const pl = value - cost;
    const chg = tf === "1D" ? lv?.chg ?? rets?.[p.asset.ticker] ?? p.asset.chg1d : rets?.[p.asset.ticker] ?? null;
    return { p, i, etf, ter, lot, custom, ccy, price, avgUsd: lot.qty ? cost / lot.qty : 0, cost, value, pl, plPct: cost ? (pl / cost) * 100 : 0, chg };
  });
  const sum = (f: (r: (typeof base)[number]) => number) => base.reduce((a, r) => a + f(r), 0);
  const mv = sum((r) => r.value), invested = sum((r) => r.cost), pl = mv - invested;
  const today = sum((r) => {
    const c = live[r.p.asset.ticker]?.chg ?? r.p.asset.chg1d;
    return r.value - r.value / (1 + c / 100);
  });
  const all = base.map((r) => ({ ...r, actualW: mv ? (r.value / mv) * 100 : 0 }));
  const blendedTer = mv ? sum((r) => r.value * r.ter) / mv : 0;
  const yearlyCost = (mv * blendedTer) / 100;
  const missingFx = [...new Set(base.filter((r) => r.ccy !== "?" && fx[r.ccy] == null).map((r) => r.ccy))];

  const needle = q.trim().toUpperCase();
  const rows = all
    .filter((r) => !needle || r.p.asset.ticker.includes(needle) || r.p.asset.name.toUpperCase().includes(needle))
    .filter((r) => kind === "ALL" || (kind === "ETF" ? r.p.asset.kind === "etf" : kind === "STOCK" ? r.p.asset.kind === "stock" : kind === "UP" ? r.pl >= 0 : r.pl < 0))
    .sort((a, b) => {
      const v = (r: (typeof all)[number]): number | string =>
        sort.k === "name" ? r.p.asset.ticker : sort.k === "qty" ? r.lot.qty : sort.k === "avg" ? r.avgUsd : sort.k === "price" ? r.price
        : sort.k === "value" ? r.value : sort.k === "pl" ? r.pl : sort.k === "ret" ? r.chg ?? -Infinity : r.actualW;
      const x = v(a), y = v(b);
      return (typeof x === "string" ? x.localeCompare(y as string) : x - (y as number)) * sort.dir;
    });
  // First click = largest first (A→Z for names), second click flips.
  const clickSort = (k: SortKey) => setSort((s) => (s.k === k ? { k, dir: s.dir === 1 ? -1 : 1 } : { k, dir: k === "name" ? 1 : -1 }));

  const stats: [string, string, string, string?][] = [
    ["MARKET VALUE", money(mv), "text-zinc-50"],
    ["INVESTED", money(invested), "text-zinc-200"],
    ["UNREALIZED P/L", signMoney(pl), tone(pl), invested ? pct((pl / invested) * 100, 2) : ""],
    ["TODAY", signMoney(today), tone(today), mv ? pct((today / (mv - today)) * 100, 2) : ""],
    ["FEES / YEAR", money(yearlyCost), "text-zinc-200", `TER ${blendedTer.toFixed(3)}%`],
  ];
  const cols = "grid grid-cols-[minmax(130px,1.6fr)_repeat(7,minmax(64px,1fr))_16px] items-center gap-3";
  const H = (k: SortKey, children: React.ReactNode) => {
    const on = sort.k === k;
    return (
      <button key={k} type="button" onClick={() => clickSort(k)} title={on ? (sort.dir === -1 ? "Largest first — click to flip" : "Smallest first — click to flip") : "Sort"}
        className={`flex items-center gap-1 tracking-[0.12em] transition-colors hover:text-white ${k === "name" ? "justify-start" : "justify-end"} ${on ? "text-zinc-100" : ""}`}>
        {children}<span className={`text-[8px] ${on ? "text-emerald-400" : "text-zinc-700"}`}>{on ? (sort.dir === -1 ? "▼" : "▲") : "▾"}</span>
      </button>
    );
  };
  const chip = (on: boolean) => `rounded-sm border px-2 py-[3px] font-mono text-[10px] font-bold tracking-[0.08em] transition-colors ${on ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-white/[0.08] text-zinc-500 hover:border-white/[0.16] hover:text-zinc-200"}`;

  return (
    <div className={`${panel} flex h-full min-w-0 flex-col gap-3`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`${label} truncate text-zinc-300`}>[ OPEN POSITIONS ]</span>
        <CloseBtn onClick={onClose} title="Open positions" />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {stats.map(([k, v, c, sub]) => (
          <div key={k} className="rounded-sm border border-white/[0.06] bg-[#0a0a0c] px-3 py-2">
            <div className={label}>{k}</div>
            <div className={`mt-1 font-mono text-[15px] font-semibold tabular-nums ${c}`}>{v}</div>
            {sub && <div className={`font-mono text-[10px] tabular-nums ${k === "FEES / YEAR" ? "text-zinc-600" : c}`}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* Filters + timeframe */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SEARCH…" spellCheck={false}
          className="h-7 w-[140px] rounded-sm border border-white/[0.08] bg-[#0a0a0c] px-2 font-mono text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/[0.2]" />
        {(["ALL", "ETF", "STOCK", "UP", "DOWN"] as KindFilter[]).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={chip(kind === k)}>{k === "UP" ? "IN PROFIT" : k === "DOWN" ? "AT LOSS" : k}</button>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <span className="mr-1 font-mono text-[9.5px] tracking-[0.12em] text-zinc-600">CHANGE</span>
          {TABLE_TFS.map((t) => <button key={t} type="button" onClick={() => onTfChange(t)} className={chip(tf === t)}>{t}</button>)}
        </span>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <div className="min-w-[860px]">
          <div className={`${cols} px-4 pb-1.5 font-mono text-[9px] text-zinc-600`}>
            {H("name", "INSTRUMENT")}
            {H("value", "VALUE $")}
            {H("pl", "P/L $")}
            {H("ret", `${tf} %`)}
            {H("weight", "WEIGHT")}
            {H("qty", "SHARES")}
            {H("price", "PRICE NOW $")}
            {H("avg", "AVG BUY $")}
            <span />
          </div>

          <div className="flex flex-col gap-1.5">
            {rows.map((r) => {
              const { p, i, etf, ter } = r;
              const color = SEG_COLORS[i % SEG_COLORS.length];
              const isOpen = open === p.asset.ticker;
              const look = lookRows(p, 12);
              return (
                <div key={p.asset.ticker} className={`overflow-hidden rounded-sm border transition-colors ${isOpen ? "border-white/[0.1] bg-white/[0.015]" : "border-white/[0.06] bg-[#0a0a0c]"}`}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : p.asset.ticker)}
                    aria-expanded={isOpen}
                    className={`${cols} w-full px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="h-8 w-1 flex-none" style={{ background: color }} />
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[14px] font-bold text-zinc-50">{p.asset.ticker}</span>
                          <span className="rounded-sm bg-white/[0.06] px-1.5 py-px font-mono text-[9px] font-bold tracking-[0.1em] text-zinc-400">{p.asset.kind === "etf" ? "ETF" : "STOCK"}</span>
                          {r.ccy !== "USD" && r.ccy !== "?" && <span className="font-mono text-[9px] text-oasis" title={`Trades in ${r.ccy}, converted to USD at today's rate`}>{r.ccy}→$</span>}
                        </span>
                        <span className="truncate text-[11px] text-zinc-500">{p.asset.name}</span>
                      </span>
                    </span>
                    <span className="text-right font-mono text-[12.5px] font-semibold tabular-nums text-zinc-50">{money(r.value)}</span>
                    <span className={`flex flex-col items-end font-mono tabular-nums ${tone(r.pl)}`}>
                      <span className="text-[12px] font-semibold">{signMoney(r.pl)}</span>
                      <span className="text-[10px]">{pct(r.plPct, 2)}</span>
                    </span>
                    <span className={`text-right font-mono text-[12px] tabular-nums ${r.chg == null ? "text-zinc-600" : tone(r.chg)}`}>{r.chg == null ? "…" : pct(r.chg, 2)}</span>
                    <span className="text-right font-mono text-[12px] font-semibold tabular-nums text-zinc-100">{r.actualW.toFixed(1)}%</span>
                    <span className="text-right font-mono text-[12px] tabular-nums text-zinc-400">{qtyFmt(r.lot.qty)}</span>
                    <span className="text-right font-mono text-[12px] tabular-nums text-zinc-300">{r.price.toFixed(2)}</span>
                    <span className="text-right font-mono text-[12px] tabular-nums text-zinc-500">{r.avgUsd.toFixed(2)}</span>
                    <motion.span animate={{ rotate: isOpen ? 90 : 0 }} className="text-center font-mono text-[11px] text-zinc-500">▶</motion.span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="border-t border-white/[0.06] bg-[#030303]"
                      >
                        <LotEditor key={`${r.lot.qty}-${r.lot.avg}`} lot={r.lot} custom={r.custom} ccy={r.ccy === "?" ? "BROKER CCY" : r.ccy} onSave={(l) => saveLot(p.asset.ticker, l)} />

                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 border-t border-white/[0.06] px-4 py-3 font-mono text-[11px] sm:grid-cols-4">
                          {([
                            ["COST BASIS", money(r.cost)],
                            ["YTD", pct(p.asset.ytd)],
                            ["TER", etf ? terFmt(ter) : "—"],
                            ["AUM", etf ? fmtAum(etf.aum) : "—"],
                          ] as const).map(([k, v]) => (
                            <span key={k} className="flex justify-between gap-2"><span className="text-zinc-600">{k}</span><span className="text-zinc-200">{v}</span></span>
                          ))}
                        </div>

                        <div className="grid grid-cols-[60px_minmax(0,1fr)_64px_84px_92px] gap-3 border-t border-white/[0.06] px-4 pb-1 pt-3 font-mono text-[9px] tracking-[0.12em] text-zinc-600">
                          <span>STOCK</span><span />
                          <span className="text-right">IN {p.asset.kind === "etf" ? "ETF" : "POS"}</span>
                          <span className="text-right" title={`Weight in ETF × ${p.weight}% of portfolio`}>VIA {p.asset.ticker}</span>
                          <span className="text-right" title="Summed across every position that holds it">TOTAL</span>
                        </div>
                        {look.map((lr) => {
                          const k = lr.ticker, n = holders[k] ?? 1;
                          return (
                            <div key={lr.ticker} className="grid grid-cols-[60px_minmax(0,1fr)_64px_84px_92px] items-center gap-3 px-4 py-1.5">
                              <Link href={`/stock/${lr.ticker}`} className="truncate font-mono text-[12px] font-bold text-zinc-200 hover:text-emerald-300">{lr.ticker}</Link>
                              <span className="truncate text-[12px] text-zinc-500">{lr.name}</span>
                              <span className="text-right font-mono text-[12px] text-zinc-400">{lr.inFund.toFixed(2)}%</span>
                              <span className="text-right font-mono text-[12px] text-zinc-200">{lr.inPortfolio.toFixed(2)}%</span>
                              <span className="flex items-center justify-end gap-1.5 font-mono text-[12px] font-semibold text-zinc-50">
                                {n > 1 && <span className="font-mono text-[9px] font-bold text-amber-400" title={`Held by ${n} positions`}>×{n}</span>}
                                {(total[k] ?? lr.inPortfolio).toFixed(2)}%
                              </span>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-end gap-3 px-4 pb-3 pt-2">
                          {!etf && (
                            <Link href={`/stock/${p.asset.ticker}`} className="whitespace-nowrap font-mono text-[10.5px] tracking-[0.1em] text-zinc-400 hover:text-white">
                              [ {p.asset.ticker} STOCK DEEP DIVE → ]
                            </Link>
                          )}
                          {etf && (
                            <Link href={`/etf/${p.asset.ticker}`} className="whitespace-nowrap font-mono text-[10.5px] tracking-[0.1em] text-zinc-400 hover:text-white">
                              [ {p.asset.ticker} DEEP VIEW → ]
                            </Link>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
            {rows.length === 0 && <p className="m-0 px-4 py-3 font-mono text-[11px] text-zinc-600">No positions match this filter.</p>}
          </div>
        </div>
      </div>
      {missingFx.length > 0 && <p className="m-0 font-mono text-[10px] text-amber-400">⚠ No live FX rate for {missingFx.join(", ")} — those values are not converted yet.</p>}
    </div>
  );
}

/* ───────────────────── Resizable split row ───────────────────── */

type PaneId = "sector" | "flows";
const PANE_TITLE: Record<PaneId, string> = { sector: "Sector Overlap", flows: "Capital flow / Sector shift" };
const LAYOUT_KEY = "inferno.portfolio.split.v5";
const DEFAULT_RATIO = 0.6;

/** Narrow "+" rail that brings a hidden panel back. */
function AddRail({ id, onAdd }: { id: PaneId; onAdd: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onAdd}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      title={`Show ${PANE_TITLE[id]}`}
      className="group flex w-12 flex-none flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-white/[0.08] bg-[#030303] text-zinc-500 transition-colors hover:border-red-500/40 hover:text-white"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-white/[0.05] text-[16px] leading-none group-hover:bg-red-500/20 group-hover:text-red-300">+</span>
      <span className="font-mono text-[10px] font-bold tracking-[0.14em] [writing-mode:vertical-rl]">{PANE_TITLE[id].toUpperCase()}</span>
    </motion.button>
  );
}

/**
 * Open positions (left, 70%) ⇄ Sector Overlap (right): one joined strip, equal heights, a draggable divider
 * to trade width between them (double-click resets), X to hide a panel, + to bring it back.
 */
function SplitRow({ positions, flows }: { positions: Position[]; flows: React.ReactNode }) {
  const [shown, setShown] = useState<Record<PaneId, boolean>>({ sector: true, flows: true });

  // Remember which panels are open per browser.
  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem(LAYOUT_KEY) ?? "null") as { shown?: Record<PaneId, boolean> } | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from browser storage
      if (v?.shown && "flows" in v.shown) setShown(v.shown);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({ shown })); } catch { /* ignore */ }
  }, [shown]);

  const hide = (id: PaneId) => setShown((s) => ({ ...s, [id]: false }));
  const show = (id: PaneId) => setShown((s) => ({ ...s, [id]: true }));

  if (!shown.sector && !shown.flows) {
    return (
      <div className="flex gap-3">
        {(["flows", "sector"] as PaneId[]).map((id) => (
          <button key={id} type="button" onClick={() => show(id)} className="flex flex-1 items-center justify-center gap-2 rounded-sm border border-dashed border-white/[0.08] py-3 font-mono text-[11px] font-bold tracking-[0.12em] text-zinc-500 transition-colors hover:border-red-500/40 hover:text-white">
            <span className="text-[15px]">+</span> {PANE_TITLE[id].toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  if (shown.sector && shown.flows) {
    return (
      <ResizableSplit
        storageKey="inferno.portfolio.split.v5"
        minPx={[300, 380]}
        initial={DEFAULT_RATIO}
        left={() => <FlowsPane flows={flows} onClose={() => hide("flows")} />}
        right={() => <SectorOverlap positions={positions} onClose={() => hide("sector")} />}
      />
    );
  }

  return (
    <div className="flex items-stretch gap-3">
      {shown.flows ? (
        <div className="min-w-0 flex-1"><FlowsPane flows={flows} onClose={() => hide("flows")} /></div>
      ) : (
        <AnimatePresence initial={false}><AddRail key="add-flows" id="flows" onAdd={() => show("flows")} /></AnimatePresence>
      )}
      {shown.sector ? (
        <div className="min-w-0 flex-1"><SectorOverlap positions={positions} onClose={() => hide("sector")} /></div>
      ) : (
        <AnimatePresence initial={false}><AddRail key="add-sector" id="sector" onAdd={() => show("sector")} /></AnimatePresence>
      )}
    </div>
  );
}

/* ───────────────────── Composition ───────────────────── */

/** Capital flow + sector shift bars (rendered by the page, which owns the timeframe) with a close button. */
function FlowsPane({ flows, onClose }: { flows: React.ReactNode; onClose: () => void }) {
  return (
    <div className="relative h-full min-w-0">
      <div className="absolute right-2 top-2 z-10"><CloseBtn onClick={onClose} title="Capital flow / Sector shift" /></div>
      {flows}
    </div>
  );
}

/** Bottom row of the deep view: flows (left) ⇄ sector overlap (right). Open positions sit next to the chart (page). */
export default function PortfolioDeepView({ positions, flows }: { positions: Position[]; flows: React.ReactNode }) {
  if (!positions.length) return null;
  return (
    <div className="flex flex-col gap-4">
      <motion.div custom={0} variants={reveal} initial="hidden" animate="show">
        <SplitRow positions={positions} flows={flows} />
      </motion.div>
    </div>
  );
}
