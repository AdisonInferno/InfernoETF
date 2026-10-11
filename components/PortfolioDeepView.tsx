"use client";

import Link from "next/link";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ETFS, fmtAum } from "@/lib/etfs";
import { QUOTE } from "@/lib/fund-profiles";
import { drillDown, loadLots, lookThrough, saveLots, sectorExposure, type Lot, type Position } from "@/lib/portfolio";

export const SEG_COLORS = ["#4ade80", "#60a5fa", "#a78bfa", "#f59e0b", "#f472b6", "#22d3ee", "#f87171", "#a3e635"];
const panel = "rounded-xl border border-white/[0.04] bg-black/30 p-5";
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
      className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-white/[0.08] hover:text-white"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.6"><path d="M1 1l8 8M9 1L1 9" /></svg>
    </button>
  );
}

/* ───────────────────── Sector overlap breakdown ───────────────────── */

function SectorOverlap({ positions, onClose }: { positions: Position[]; onClose?: () => void }) {
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
          const contributors = Object.keys(r.by).length;
          return (
            <div key={r.sector} className="grid grid-cols-[minmax(80px,130px)_minmax(0,1fr)_52px] items-center gap-3">
              <span className="truncate text-[12.5px] text-zinc-300">
                {r.sector}
                {contributors > 1 && <span className="ml-1.5 font-mono text-[9px] text-amber-400">×{contributors}</span>}
              </span>
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
      <div className="flex flex-wrap gap-3 border-t border-white/[0.04] pt-3">
        {positions.map((p, i) => (
          <span key={p.asset.ticker} className="flex items-center gap-1.5 font-mono text-[10.5px] text-zinc-400">
            <span className="h-2 w-2 rounded-sm" style={{ background: SEG_COLORS[i % SEG_COLORS.length] }} />{p.asset.ticker}
          </span>
        ))}
        <span className="ml-auto font-mono text-[10px] text-zinc-600"><span className="text-amber-400">×N</span> = sector held by N positions</span>
      </div>
    </div>
  );
}

/* ───────────────────── ETFs in the portfolio (+ look-through) ───────────────────── */

const NOTIONAL = 124_580; // same model account as the page header
const CCY_SIGN: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", PLN: "zł " };
const money = (v: number, ccy = "USD") => {
  const n = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = CCY_SIGN[ccy] ?? `${ccy} `;
  return (v < 0 ? "-" : "") + sign + n;
};
const signMoney = (v: number, ccy?: string) => (v > 0 ? "+" : "") + money(v, ccy);
const tone = (v: number) => (v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-300");
const qtyFmt = (q: number) => q.toLocaleString("en-US", { maximumFractionDigits: 4 });

/** Default lot when the user hasn't entered one: the model account split by target weight, bought on Jan 1 (price before YTD move). */
const defaultLot = (p: Position): Lot => ({
  qty: +((NOTIONAL * p.weight) / 100 / p.asset.price).toFixed(4),
  avg: +(p.asset.price / (1 + p.asset.ytd / 100)).toFixed(2),
});

function useLots() {
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
  return { lots, save };
}

/** Inline editor for quantity + average price (XTB-style "open position"). */
function LotEditor({ lot, custom, onSave }: { lot: Lot; custom: boolean; onSave: (l: Lot | null) => void }) {
  const [qty, setQty] = useState(String(lot.qty));
  const [avg, setAvg] = useState(String(lot.avg));
  const q = Number(qty.replace(",", ".")), a = Number(avg.replace(",", "."));
  const ok = q > 0 && a > 0;
  const input = "h-8 w-28 rounded-sm border border-white/[0.08] bg-[#030303] px-2 font-mono text-[12px] text-zinc-100 outline-none focus:border-white/[0.2]";
  return (
    <div className="flex flex-wrap items-end gap-3 px-4 pb-3 pt-3">
      <label className="flex flex-col gap-1"><span className={label}>QTY</span><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" className={input} /></label>
      <label className="flex flex-col gap-1"><span className={label}>AVG OPEN PRICE $</span><input value={avg} onChange={(e) => setAvg(e.target.value)} inputMode="decimal" className={input} /></label>
      <button type="button" disabled={!ok} onClick={() => onSave({ qty: q, avg: a, price: lot.price, ccy: lot.price != null ? lot.ccy : undefined })} className="h-8 rounded-sm border border-white/[0.12] px-3 font-mono text-[10.5px] tracking-[0.1em] text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40">[ SAVE ]</button>
      {custom && <button type="button" onClick={() => onSave(null)} className="h-8 px-1 font-mono text-[10.5px] tracking-[0.1em] text-zinc-500 hover:text-white">[ RESET ]</button>}
      <span className="ml-auto self-center font-mono text-[10px] text-zinc-600">{custom ? "YOUR ENTRY" : "DEFAULT · MODEL ACCOUNT, BOUGHT JAN 1"}</span>
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

function PortfolioEtfs({ positions, onClose }: { positions: Position[]; onClose?: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const { lots, save } = useLots();
  /** Total look-through weight of every stock across the whole portfolio, % */
  const total = useMemo(() => lookThrough(positions), [positions]);
  /** How many positions hold each stock */
  const holders = useMemo(() => {
    const n: Record<string, number> = {};
    positions.forEach((p) => lookRows(p, 500).forEach((r) => { n[r.ticker] = (n[r.ticker] ?? 0) + 1; }));
    return n;
  }, [positions]);

  const base = positions.map((p, i) => {
    const etf = ETFS.find((e) => e.ticker === p.asset.ticker);
    const ter = etf ? QUOTE[p.asset.ticker]?.[1] ?? 0 : 0;
    const custom = !!lots[p.asset.ticker];
    const lot = lots[p.asset.ticker] ?? defaultLot(p);
    // Broker numbers (imported) win over our own quotes; they're already in the account currency.
    const price = lot.price ?? p.asset.price;
    const value = lot.value ?? lot.qty * price;
    const cost = lot.pl != null ? value - lot.pl : lot.qty * lot.avg;
    const pl = value - cost;
    const today = value - value / (1 + p.asset.chg1d / 100);
    return { p, i, etf, ter, lot, custom, price, cost, value, pl, plPct: cost ? (pl / cost) * 100 : 0, today };
  });
  const ccy = base.find((r) => r.lot.ccy)?.lot.ccy ?? "USD";
  const M = (v: number) => money(v, ccy);
  const SM = (v: number) => signMoney(v, ccy);
  const sum = (f: (r: (typeof base)[number]) => number) => base.reduce((a, r) => a + f(r), 0);
  const mv = sum((r) => r.value), invested = sum((r) => r.cost), pl = mv - invested, today = sum((r) => r.today);
  const rows = base.map((r) => ({ ...r, actualW: mv ? (r.value / mv) * 100 : 0 }));
  const blendedTer = mv ? sum((r) => r.value * r.ter) / mv : 0;
  const yearlyCost = (mv * blendedTer) / 100;

  const stats: [string, string, string, string?][] = [
    ["MARKET VALUE", M(mv), "text-zinc-50"],
    ["INVESTED", M(invested), "text-zinc-200"],
    ["UNREALIZED P/L", SM(pl), tone(pl), invested ? pct((pl / invested) * 100, 2) : ""],
    ["TODAY", SM(today), tone(today), mv ? pct((today / (mv - today)) * 100, 2) : ""],
    ["FEES / YEAR", M(yearlyCost), "text-zinc-200", `TER ${blendedTer.toFixed(3)}%`],
  ];
  const cols = "grid grid-cols-[minmax(130px,1.6fr)_repeat(7,minmax(64px,1fr))_16px] items-center gap-3";

  return (
    <div className={`${panel} flex h-full min-w-0 flex-col gap-4`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`${label} truncate text-zinc-300`}>[ OPEN POSITIONS · {positions.length} ]</span>
        <CloseBtn onClick={onClose} title="Open positions" />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {stats.map(([k, v, c, sub]) => (
          <div key={k} className="rounded-sm border border-white/[0.05] bg-[#0a0a0c] px-3 py-2">
            <div className={label}>{k}</div>
            <div className={`mt-1 font-mono text-[15px] font-semibold tabular-nums ${c}`}>{v}</div>
            {sub && <div className={`font-mono text-[10px] tabular-nums ${k === "FEES / YEAR" ? "text-zinc-600" : c}`}>{sub}</div>}
          </div>
        ))}
      </div>

      <div className="min-w-0 overflow-x-auto">
        <div className="min-w-[860px]">
          <div className={`${cols} px-4 pb-1.5 font-mono text-[9px] tracking-[0.12em] text-zinc-600`}>
            <span>INSTRUMENT</span>
            <span className="text-right">QTY</span>
            <span className="text-right">AVG PRICE</span>
            <span className="text-right">PRICE</span>
            <span className="text-right">VALUE</span>
            <span className="text-right">P/L</span>
            <span className="text-right">1D</span>
            <span className="text-right">WEIGHT</span>
            <span />
          </div>

          <div className="flex flex-col gap-1.5">
            {rows.map((r) => {
              const { p, i, etf, ter } = r;
              const color = SEG_COLORS[i % SEG_COLORS.length];
              const isOpen = open === p.asset.ticker;
              const look = lookRows(p, 12);
              return (
                <div key={p.asset.ticker} className={`overflow-hidden rounded-sm border transition-colors ${isOpen ? "border-white/[0.1] bg-white/[0.015]" : "border-white/[0.05] bg-[#0a0a0c]"}`}>
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
                          <span className="rounded-sm bg-white/[0.06] px-1.5 py-px font-mono text-[9px] font-bold tracking-[0.1em] text-zinc-400">{etf ? "ETF" : "STOCK"}</span>
                        </span>
                        <span className="truncate text-[11px] text-zinc-500">{p.asset.name}</span>
                      </span>
                    </span>
                    <span className="text-right font-mono text-[12px] tabular-nums text-zinc-200">{qtyFmt(r.lot.qty)}</span>
                    <span className="text-right font-mono text-[12px] tabular-nums text-zinc-400">{r.lot.avg.toFixed(2)}</span>
                    <span className="text-right font-mono text-[12px] tabular-nums text-zinc-100">{r.price.toFixed(2)}</span>
                    <span className="text-right font-mono text-[12px] tabular-nums text-zinc-100">{M(r.value)}</span>
                    <span className={`flex flex-col items-end font-mono tabular-nums ${tone(r.pl)}`}>
                      <span className="text-[12px] font-semibold">{SM(r.pl)}</span>
                      <span className="text-[10px]">{pct(r.plPct, 2)}</span>
                    </span>
                    <span className={`text-right font-mono text-[12px] tabular-nums ${tone(p.asset.chg1d)}`}>{pct(p.asset.chg1d, 2)}</span>
                    <span className="flex flex-col items-end font-mono tabular-nums">
                      <span className="text-[12px] font-semibold text-zinc-100">{r.actualW.toFixed(1)}%</span>
                      <span className="text-[10px] text-zinc-600">TGT {p.weight}%</span>
                    </span>
                    <motion.span animate={{ rotate: isOpen ? 90 : 0 }} className="text-center font-mono text-[11px] text-zinc-500">▶</motion.span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="border-t border-white/[0.05] bg-black/20"
                      >
                        <LotEditor key={`${r.lot.qty}-${r.lot.avg}`} lot={r.lot} custom={r.custom} onSave={(l) => save(p.asset.ticker, l)} />

                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 border-t border-white/[0.04] px-4 py-3 font-mono text-[11px] sm:grid-cols-4">
                          {([
                            ["COST BASIS", M(r.cost)],
                            ["YTD", pct(p.asset.ytd)],
                            ["TER", etf ? terFmt(ter) : "—"],
                            ["AUM", etf ? fmtAum(etf.aum) : "—"],
                          ] as const).map(([k, v]) => (
                            <span key={k} className="flex justify-between gap-2"><span className="text-zinc-600">{k}</span><span className="text-zinc-200">{v}</span></span>
                          ))}
                        </div>

                        <div className="grid grid-cols-[60px_minmax(0,1fr)_64px_84px_92px] gap-3 border-t border-white/[0.04] px-4 pb-1 pt-3 font-mono text-[9px] tracking-[0.12em] text-zinc-600">
                          <span>STOCK</span><span />
                          <span className="text-right">IN {p.asset.kind === "etf" ? "ETF" : "POS"}</span>
                          <span className="text-right" title={`Weight in ETF × ${p.weight}% of portfolio`}>VIA {p.asset.ticker}</span>
                          <span className="text-right" title="Summed across every position that holds it">TOTAL</span>
                        </div>
                        {look.map((lr) => {
                          const k = lr.ticker, n = holders[k] ?? 1;
                          return (
                            <div key={lr.ticker} className="grid grid-cols-[60px_minmax(0,1fr)_64px_84px_92px] items-center gap-3 px-4 py-1.5">
                              <span className="truncate font-mono text-[12px] font-bold text-zinc-200">{lr.ticker}</span>
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
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── Resizable split row ───────────────────── */

type PaneId = "sector" | "etfs";
const PANE_TITLE: Record<PaneId, string> = { sector: "Sector Overlap", etfs: "Open positions" };
const MIN_RATIO = 0.28;
const LAYOUT_KEY = "inferno.portfolio.split.v3";
const DEFAULT_RATIO = 0.7;

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
      className="group flex w-12 flex-none flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/[0.08] bg-black/20 text-zinc-500 transition-colors hover:border-red-500/40 hover:text-white"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.05] text-[16px] leading-none group-hover:bg-red-500/20 group-hover:text-red-300">+</span>
      <span className="font-mono text-[10px] font-bold tracking-[0.14em] [writing-mode:vertical-rl]">{PANE_TITLE[id].toUpperCase()}</span>
    </motion.button>
  );
}

/**
 * Open positions (left, 70%) ⇄ Sector Overlap (right): one joined strip, equal heights, a draggable divider
 * to trade width between them (double-click resets), X to hide a panel, + to bring it back.
 */
function SplitRow({ positions }: { positions: Position[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(DEFAULT_RATIO); // width share of the left (positions) panel
  const [shown, setShown] = useState<Record<PaneId, boolean>>({ sector: true, etfs: true });
  const [dragging, setDragging] = useState(false);

  // Remember the layout per browser.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LAYOUT_KEY);
      if (raw) {
        const v = JSON.parse(raw) as { ratio: number; shown: Record<PaneId, boolean> };
        /* eslint-disable react-hooks/set-state-in-effect -- one-time restore from browser storage */
        setRatio(Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, v.ratio)));
        if (v.shown && "etfs" in v.shown) setShown(v.shown);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({ ratio, shown })); } catch { /* ignore */ }
  }, [ratio, shown]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = rowRef.current;
    if (!el) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    const rect = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const r = (ev.clientX - rect.left) / rect.width;
      setRatio(Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, r)));
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") setRatio((r) => Math.max(MIN_RATIO, r - 0.04));
    if (e.key === "ArrowRight") setRatio((r) => Math.min(1 - MIN_RATIO, r + 0.04));
  };

  const both = shown.sector && shown.etfs;
  const hide = (id: PaneId) => setShown((s) => ({ ...s, [id]: false }));
  const show = (id: PaneId) => setShown((s) => ({ ...s, [id]: true }));
  const spring = dragging ? { duration: 0 } : { type: "spring" as const, stiffness: 260, damping: 30 };

  if (!shown.sector && !shown.etfs) {
    return (
      <div className="flex gap-3">
        {(["etfs", "sector"] as PaneId[]).map((id) => (
          <button key={id} type="button" onClick={() => show(id)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.08] py-6 font-mono text-[11px] font-bold tracking-[0.12em] text-zinc-500 transition-colors hover:border-red-500/40 hover:text-white">
            <span className="text-[15px]">+</span> {PANE_TITLE[id].toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={rowRef} className={`flex flex-col items-stretch gap-4 xl:flex-row xl:gap-0 ${dragging ? "cursor-col-resize select-none" : ""}`}>
      <AnimatePresence initial={false}>
        {!shown.etfs && <AddRail key="add-etfs" id="etfs" onAdd={() => show("etfs")} />}
      </AnimatePresence>
      {!shown.etfs && <div className="hidden w-3 xl:block" />}

      {shown.etfs && (
        <motion.div
          layout
          transition={spring}
          className={`min-w-0 ${both ? "xl:w-[var(--split-w)] xl:flex-none" : "flex-1"}`}
          style={{ "--split-w": `calc(${ratio * 100}% - 6px)` } as React.CSSProperties}
        >
          <PortfolioEtfs positions={positions} onClose={() => hide("etfs")} />
        </motion.div>
      )}

      {both && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={Math.round(MIN_RATIO * 100)}
          aria-valuemax={Math.round((1 - MIN_RATIO) * 100)}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onDoubleClick={() => setRatio(DEFAULT_RATIO)}
          onKeyDown={onKey}
          title="Drag to resize · double-click to reset"
          className="group relative hidden w-3 flex-none cursor-col-resize touch-none items-center justify-center outline-none xl:flex"
        >
          <span className={`h-full w-px transition-colors ${dragging ? "bg-red-500/70" : "bg-white/[0.06] group-hover:bg-red-500/50 group-focus-visible:bg-red-500/50"}`} />
          <span className={`absolute flex h-10 w-2.5 flex-col items-center justify-center gap-[3px] rounded-full border transition-colors ${dragging ? "border-red-500/60 bg-[#1a0b0b]" : "border-white/[0.1] bg-[#0f0f11] group-hover:border-red-500/40"}`}>
            {[0, 1, 2].map((d) => <span key={d} className={`h-[3px] w-[3px] rounded-full ${dragging ? "bg-red-400" : "bg-zinc-500 group-hover:bg-red-300"}`} />)}
          </span>
        </div>
      )}

      {shown.sector && (
        <motion.div layout transition={spring} className="min-w-0 flex-1">
          <SectorOverlap positions={positions} onClose={() => hide("sector")} />
        </motion.div>
      )}

      {!shown.sector && <div className="hidden w-3 xl:block" />}
      <AnimatePresence initial={false}>
        {!shown.sector && <AddRail key="add-sector" id="sector" onAdd={() => show("sector")} />}
      </AnimatePresence>
    </div>
  );
}

/* ───────────────────── Composition ───────────────────── */

export default function PortfolioDeepView({ positions }: { positions: Position[] }) {
  if (!positions.length) return null;
  return (
    <div className="flex flex-col gap-4">
      <motion.div custom={0} variants={reveal} initial="hidden" animate="show">
        <SplitRow positions={positions} />
      </motion.div>
    </div>
  );
}
