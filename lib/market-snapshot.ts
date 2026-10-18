"use client";

/* Live "today" numbers (price, 1D %, YTD %) for any symbols, shared across the whole app:
   one module-level cache + one batched request per minute per symbol set.
   Use `useSnapshot(symbols)`; `withLive(row, snap)` overlays them on static database rows. */

import { useEffect, useMemo, useState } from "react";
import { ETFS, type EtfRow } from "@/lib/etfs";
import { QUOTE } from "@/lib/fund-profiles";


export interface Snap { price: number; chg1d: number; ytd: number | null; currency: string; asOf: number }
const store = new Map<string, { at: number; s: Snap | null }>();
const inflight = new Map<string, Promise<void>>();
const TTL = 60_000;

async function load(syms: string[]) {
  const need = syms.filter((s) => { const h = store.get(s); return !h || Date.now() - h.at > TTL; }).filter((s) => !inflight.has(s));
  if (!need.length) { await Promise.all(syms.map((s) => inflight.get(s)).filter(Boolean)); return; }
  for (let i = 0; i < need.length; i += 150) {
    const chunk = need.slice(i, i + 150);
    const p = fetch(`/api/market/snapshot?symbols=${encodeURIComponent(chunk.join(","))}`)
      .then((r) => r.json())
      .then((j: { snap?: Record<string, Snap | null> }) => { chunk.forEach((s) => store.set(s, { at: Date.now(), s: j.snap?.[s] ?? null })); })
      .catch(() => { chunk.forEach((s) => store.set(s, { at: Date.now(), s: null })); })
      .finally(() => chunk.forEach((s) => inflight.delete(s)));
    chunk.forEach((s) => inflight.set(s, p));
    await p;
  }
}

/** true once a request for `sym` has finished (a null snapshot then means "no live data", not "still loading"). */
export const snapLoaded = (sym: string) => store.has(sym.toUpperCase());

/** Live snapshot per symbol (null = no live data → keep the static value). Refreshes every minute. */
export function useSnapshot(symbols: string[]): Record<string, Snap | null> {
  const key = [...new Set(symbols.map((s) => s.toUpperCase()))].sort().join(",");
  const [ver, bump] = useState(0);
  useEffect(() => {
    if (!key) return;
    let off = false;
    const syms = key.split(",");
    const run = () => load(syms).then(() => { if (!off) bump((n) => n + 1); });
    run();
    const id = window.setInterval(run, TTL);
    return () => { off = true; window.clearInterval(id); };
  }, [key]);
  return useMemo(() => {
    const out: Record<string, Snap | null> = {};
    if (key) for (const s of key.split(",")) out[s] = store.get(s)?.s ?? null;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ver` bumps when the store has new data
  }, [key, ver]);
}

/* ── ETF database rows with today's real numbers ── */

const ALL_ETF_SYMS = ETFS.map((e) => e.ticker);

/** Every ETF in the database with live 1D / YTD (static database values only where Yahoo has nothing),
 *  plus a live price map (falls back to the stored quote). `live` = how many rows got real data. */
export function useLiveEtfs(): { etfs: EtfRow[]; price: Record<string, number | undefined>; live: number } {
  const snap = useSnapshot(ALL_ETF_SYMS);
  return useMemo(() => {
    let live = 0;
    const price: Record<string, number | undefined> = {};
    const etfs = ETFS.map((e) => {
      const s = snap[e.ticker];
      price[e.ticker] = s?.price ?? QUOTE[e.ticker]?.[0];
      if (!s) return e;
      live++;
      return { ...e, chg1d: s.chg1d, ytd: s.ytd ?? e.ytd };
    });
    return { etfs, price, live };
  }, [snap]);
}
