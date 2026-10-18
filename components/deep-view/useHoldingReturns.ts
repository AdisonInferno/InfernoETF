"use client";

/* Real per-holding returns for the Composition Map, from the existing endpoints:
     1D           → /api/market/snapshot (shared useSnapshot cache)
     1M … 5Y      → /api/prices closes (server-cached 15 min; client-cached here per range+symbol)
   return = last close / close at (last bar − period) − 1, price only.
   A holding gets `null` when Yahoo has no series for its symbol or the series does not reach back
   far enough for the period — the UI shows those as N/A instead of guessing. */

import { useEffect, useMemo, useState } from "react";
import { snapLoaded, useSnapshot } from "@/lib/market-snapshot";

export type RetPeriod = "1D" | "1W" | "2W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "5Y";
/** Composition Map periods (all of them are also terminal-chart timeframes) */
export type CompPeriod = Exclude<RetPeriod, "2W">;
export const RET_PERIODS: CompPeriod[] = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"];
/** colour-scale half-width (± % that reaches full colour) per period */
export const RET_SCALE: Record<RetPeriod, number> = { "1D": 3, "1W": 6, "2W": 8, "1M": 10, "3M": 20, "6M": 30, YTD: 35, "1Y": 50, "3Y": 100, "5Y": 150 };
export const PERIOD_LABEL: Record<RetPeriod, string> = { "1D": "1-day", "1W": "1-week", "2W": "2-week", "1M": "1-month", "3M": "3-month", "6M": "6-month", YTD: "year-to-date", "1Y": "1-year", "3Y": "3-year (cumulative)", "5Y": "5-year (cumulative)" };

const RANGE: Record<Exclude<RetPeriod, "1D">, string> = { "1W": "1mo", "2W": "1mo", "1M": "3mo", "3M": "3mo", "6M": "1y", YTD: "ytd", "1Y": "1y", "3Y": "5y", "5Y": "5y" };
const DAYS: Record<Exclude<RetPeriod, "1D" | "YTD">, number> = { "1W": 7, "2W": 14, "1M": 30, "3M": 91, "6M": 182, "1Y": 365, "3Y": 1096, "5Y": 1826 };
const DAY = 86400;

export type Series = { t: number[]; c: number[] } | null;
const cache = new Map<string, Series>(); // `${range}:${SYM}`

async function loadSeries(syms: string[], range: string): Promise<boolean> {
  const need = syms.filter((s) => !cache.has(`${range}:${s}`));
  let ok = true;
  for (let i = 0; i < need.length; i += 20) {
    const chunk = need.slice(i, i + 20);
    try {
      const r = await fetch(`/api/prices?symbols=${encodeURIComponent(chunk.join(","))}&range=${range}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { series?: Record<string, Series> };
      chunk.forEach((s) => cache.set(`${range}:${s}`, j.series?.[s] ?? null));
    } catch { ok = false; /* request failed: leave uncached so a later visit retries */ }
  }
  return ok;
}

/** /api/prices range that covers a period ("1D" → today's intraday bars, used for sparklines). */
export const rangeFor = (p: RetPeriod) => (p === "1D" ? "1d" : RANGE[p]);

/** Index of the period's start bar (last close at or before end − period), or null when history is too short. */
function startIndex(s: NonNullable<Series>, p: Exclude<RetPeriod, "1D">): number | null {
  if (p === "YTD") return 0; // range=ytd starts at the first session of the year
  const target = s.t[s.t.length - 1] - DAYS[p] * DAY;
  if (s.t[0] > target + (DAYS[p] <= 14 ? 3 : 10) * DAY) return null; // history too short for this period
  let k = 0;
  while (k + 1 < s.t.length && s.t[k + 1] <= target) k++;
  return k;
}

/** Return_T = (P_now − P_start) / P_start × 100 — the one formula every view uses. */
export function periodReturn(s: Series, p: Exclude<RetPeriod, "1D">): number | null {
  if (!s || s.c.length < 2) return null;
  const k = startIndex(s, p);
  const last = s.c[s.c.length - 1];
  return k != null && s.c[k] ? ((last - s.c[k]) / s.c[k]) * 100 : null;
}

/** The bars a period's return is measured over (for sparklines that must match the number). */
export function periodWindow(s: Series, p: RetPeriod): { t: number[]; c: number[] } | null {
  if (!s || s.c.length < 2) return null;
  if (p === "1D") return s;
  const k = startIndex(s, p);
  return k == null ? null : { t: s.t.slice(k), c: s.c.slice(k) };
}

export type RetState = "loading" | "ready" | "error";

/** Closes for several symbols over one /api/prices range, from the shared client cache.
 *  state: "loading" until every request finished, "error" when a request itself failed
 *  (a symbol Yahoo does not know comes back as a null series, which is not an error). */
export function usePriceSeries(symbols: string[], range: string | null): { series: Record<string, Series>; state: RetState } {
  const key = useMemo(() => [...new Set(symbols.map((t) => t.toUpperCase()))].sort().join(","), [symbols]);
  const reqKey = range && key ? `${range}|${key}` : "";
  const [done, setDone] = useState<{ key: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!range || !key) return;
    let dead = false;
    loadSeries(key.split(","), range).then((ok) => { if (!dead) setDone({ key: `${range}|${key}`, ok }); });
    return () => { dead = true; };
  }, [range, key]);
  return useMemo(() => {
    const series: Record<string, Series> = {};
    if (!reqKey || done?.key !== reqKey) return { series, state: "loading" };
    for (const s of key.split(",")) series[s] = cache.get(`${range}:${s}`) ?? null;
    return { series, state: done.ok ? "ready" : "error" };
  }, [reqKey, done, key, range]);
}

/** Returns per ticker (null = no data for that holding) + overall request state. */
export function useHoldingReturns(tickers: string[], period: RetPeriod): { ret: Record<string, number | null>; state: RetState } {
  const syms = useMemo(() => [...new Set(tickers.map((t) => t.toUpperCase()))].sort(), [tickers]);
  const range = period === "1D" ? null : RANGE[period];

  /* 1D: today's move from the shared snapshot */
  const snap = useSnapshot(period === "1D" ? syms : []);
  const px = usePriceSeries(syms, range);

  return useMemo(() => {
    const ret: Record<string, number | null> = {};
    if (period === "1D") {
      let loaded = 0;
      for (const s of syms) { ret[s] = snap[s]?.chg1d ?? null; if (snapLoaded(s)) loaded++; }
      return { ret, state: loaded < syms.length ? "loading" : "ready" };
    }
    if (px.state === "loading") return { ret, state: "loading" };
    for (const s of syms) ret[s] = periodReturn(px.series[s] ?? null, period);
    return { ret, state: px.state };
  }, [period, syms, snap, px]);
}
