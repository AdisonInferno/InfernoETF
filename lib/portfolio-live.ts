"use client";

/* ─────────────────────────────────────────────────────────────
   Live data for the portfolio: quotes in their own currency → USD,
   and price history per timeframe (Yahoo via /api/quotes + /api/prices).
   Everything shown in the portfolio is converted to US dollars:
     · instrument prices (EUR, PLN, GBp …) with today's FX rate,
     · broker values / P&L (account currency, e.g. PLN) the same way.
   Falls back to model data (clearly flagged) when Yahoo is unreachable.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { buildFund } from "@/components/deep-view/buildFund";
import { makeSeries } from "@/components/deep-view/mockData";
import type { Tf } from "@/components/deep-view/types";
import type { Asset, Lot } from "@/lib/portfolio";

export type PTf = "3Y" | "1Y" | "YTD" | "3M" | "1M" | "1W" | "1D";
/** Table timeframes (long → short) */
export const TABLE_TFS: PTf[] = ["3Y", "1Y", "YTD", "3M", "1M", "1W", "1D"];
/** Chart timeframes for the slider (oldest at the top) */
export const CHART_TFS: PTf[] = ["1Y", "YTD", "3M", "1M", "1W", "1D"];
const RANGE: Record<PTf, string> = { "3Y": "5y", "1Y": "1y", YTD: "ytd", "3M": "3mo", "1M": "1mo", "1W": "5d", "1D": "1d" };

/** XTB / broker suffix → Yahoo suffix (and the currency it trades in) */
const SUFFIX: Record<string, string> = {
  US: "", PL: ".WA", DE: ".DE", UK: ".L", NL: ".AS", FR: ".PA", IT: ".MI", ES: ".MC", CH: ".SW", BE: ".BR",
  PT: ".LS", DK: ".CO", SE: ".ST", NO: ".OL", FI: ".HE", CZ: ".PR", AT: ".VI", IE: ".IR",
};
const PROBE = [".WA", ".DE", ".L", ".AS", ".PA", ".MI", ".SW"];

/** Broker symbol ("CDR.PL", "VWCE.DE", "NVDA.US") → Yahoo symbol ("CDR.WA", "VWCE.DE", "NVDA") */
export function yahooOf(ticker: string, brokerSym?: string): string {
  const m = /^([A-Z0-9-]+)\.([A-Z]{2})$/.exec((brokerSym ?? "").toUpperCase().trim());
  if (m && m[2] in SUFFIX) return ticker.toUpperCase() + SUFFIX[m[2]]; // suffix from the broker, base = our (editable) ticker
  return ticker.toUpperCase();
}

interface Quote { price: number; chg: number; currency: string }
export interface Live { sym: string; price: number; chg: number; currency: string }

async function quotes(syms: string[]): Promise<Record<string, Quote | null>> {
  const out: Record<string, Quote | null> = {};
  for (let i = 0; i < syms.length; i += 12) {
    const chunk = syms.slice(i, i + 12);
    if (!chunk.length) continue;
    try {
      const j = await fetch(`/api/quotes?symbols=${encodeURIComponent(chunk.join(","))}`).then((r) => r.json());
      Object.assign(out, j.quotes ?? {});
    } catch { chunk.forEach((s) => (out[s] = null)); }
  }
  return out;
}

/** GBp (pence) → GBP */
const norm = (q: Quote): Quote => (q.currency === "GBp" || q.currency === "GBX" ? { ...q, price: q.price / 100, currency: "GBP" } : q);

/**
 * Live quote per ticker + USD rate per currency.
 * `fx[c]` = how many USD one unit of currency c is worth (fx.USD = 1).
 */
export function useLiveQuotes(items: { ticker: string; lot?: Lot }[], accountCcy?: string) {
  const key = items.map((i) => `${i.ticker}:${i.lot?.sym ?? ""}:${i.lot?.price ?? ""}`).join("|") + `|${accountCcy ?? ""}`;
  const [st, setSt] = useState<{ key: string; live: Record<string, Live>; fx: Record<string, number>; ok: boolean } | null>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      const first = Object.fromEntries(items.map((i) => [i.ticker, yahooOf(i.ticker, i.lot?.sym)]));
      const q1 = await quotes([...new Set(Object.values(first))]);
      const live: Record<string, Live> = {};
      const retry: { ticker: string; broker: number }[] = [];
      for (const i of items) {
        const s = first[i.ticker], q = q1[s] ? norm(q1[s]!) : null;
        const broker = i.lot?.price;
        // No exchange suffix stored and the US quote looks nothing like the broker price → probe other exchanges.
        const suspicious = !i.lot?.sym && broker && (!q || Math.abs(q.price / broker - 1) > 0.25);
        if (q && !suspicious) live[i.ticker] = { sym: s, ...q };
        else if (broker) retry.push({ ticker: i.ticker, broker });
        else if (q) live[i.ticker] = { sym: s, ...q };
      }
      if (retry.length) {
        const cands = retry.flatMap((r) => PROBE.map((p) => r.ticker + p));
        const q2 = await quotes(cands);
        for (const r of retry) {
          let best: Live | null = null, err = 0.25;
          for (const p of PROBE) {
            const raw = q2[r.ticker + p];
            if (!raw) continue;
            const q = norm(raw), e = Math.abs(q.price / r.broker - 1);
            if (e < err) { err = e; best = { sym: r.ticker + p, ...q }; }
          }
          if (best) live[r.ticker] = best;
        }
      }
      const ccys = new Set<string>(Object.values(live).map((l) => l.currency));
      if (accountCcy) ccys.add(accountCcy);
      ccys.delete("USD");
      const fx: Record<string, number> = { USD: 1 };
      if (ccys.size) {
        const fq = await quotes([...ccys].map((c) => `${c}USD=X`));
        for (const c of ccys) { const q = fq[`${c}USD=X`]; if (q?.price) fx[c] = q.price; }
      }
      if (!off) setSt({ key, live, fx, ok: Object.keys(live).length > 0 });
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures items + account currency
  }, [key]);

  return st?.key === key ? st : { key, live: {} as Record<string, Live>, fx: { USD: 1 } as Record<string, number>, ok: false, loading: true };
}

/* ───────────────────── history ───────────────────── */

export type Series = { t: number[]; c: number[] };

/** Model % change for any asset over a timeframe (ETF → fund model, stock → scaled from YTD/1D). */
export function modelPerf(a: Asset, tf: PTf): number {
  const f = a.kind === "etf" ? buildFund(a.ticker) : null;
  if (f) return tf === "1D" ? a.chg1d : f.perf[tf as Tf];
  const m: Record<PTf, number> = { "1D": a.chg1d, "1W": a.ytd / 40, "1M": a.ytd / 9, "3M": a.ytd / 3, YTD: a.ytd, "1Y": a.ytd * 1.3, "3Y": Math.max(-90, a.ytd * 3.5) };
  return m[tf];
}

const STEP: Record<PTf, number> = { "1D": 300, "1W": 1800, "1M": 86400, "3M": 86400, YTD: 86400, "1Y": 86400, "3Y": 604800 };
function modelSeries(a: Asset, tf: PTf, end: number): Series {
  const c = makeSeries(tf as Tf, a.price, modelPerf(a, tf), a.ticker, a.kind === "etf" ? buildFund(a.ticker)?.volMul ?? 1 : 1.9);
  return { t: c.map((_, i) => end - (c.length - 1 - i) * STEP[tf]), c };
}

/** Price history for every position (+ SPY), keyed by our ticker. `model` = true when any series is synthetic. */
export function useHistory(assets: Asset[], symOf: Record<string, string>, tf: PTf) {
  const tickers = assets.map((a) => a.ticker);
  const key = `${tf}:${tickers.map((t) => symOf[t] ?? t).join(",")}`;
  const [st, setSt] = useState<{ key: string; series: Record<string, Series>; model: boolean } | null>(null);

  useEffect(() => {
    if (!tickers.length) return;
    let off = false;
    const syms = [...new Set([...tickers.map((t) => symOf[t] ?? t), "SPY"])];
    (async () => {
      const got: Record<string, Series | null> = {};
      for (let i = 0; i < syms.length; i += 20) {
        try {
          const j = await fetch(`/api/prices?symbols=${encodeURIComponent(syms.slice(i, i + 20).join(","))}&range=${RANGE[tf]}`).then((r) => r.json());
          Object.assign(got, j.series ?? {});
        } catch { /* offline */ }
      }
      const end = Math.floor(Date.now() / 1000);
      const cut = tf === "3Y" ? end - 3 * 365 * 86400 : 0; // 3Y = last 3 years of the 5y weekly series
      const trim = (s: Series): Series => {
        if (!cut) return s;
        const k = s.t.findIndex((t) => t >= cut);
        return k > 0 ? { t: s.t.slice(k), c: s.c.slice(k) } : s;
      };
      let model = false;
      const series: Record<string, Series> = {};
      for (const a of assets) {
        const s = got[symOf[a.ticker] ?? a.ticker];
        if (s && s.c.length > 1) series[a.ticker] = trim(s);
        else { series[a.ticker] = modelSeries(a, tf, end); model = true; }
      }
      const spy = got.SPY;
      if (spy && spy.c.length > 1) series.SPY = trim(spy);
      else {
        const f = buildFund("SPY");
        series.SPY = modelSeries({ ticker: "SPY", name: "SPY", price: f?.price ?? 600, chg1d: 0.4, ytd: f?.perf.YTD ?? 12, sector: "", kind: "etf", dd2022: -24 }, tf, end);
        model = true;
      }
      if (!off) setSt({ key, series, model });
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures tickers, symbols and timeframe
  }, [key]);

  const data = st?.key === key ? st : null;
  /** % return over the window per ticker */
  const rets = useMemo(() => {
    if (!data) return null;
    const r: Record<string, number> = {};
    for (const [t, s] of Object.entries(data.series)) r[t] = (s.c[s.c.length - 1] / s.c[0] - 1) * 100;
    return r;
  }, [data]);
  return { data, rets };
}

/**
 * Buy-and-hold portfolio path in % (start = 0) on the SPY time grid;
 * every series is forward-filled so different exchanges / holidays line up.
 */
export function portfolioPath(series: Record<string, Series>, weights: Record<string, number>): { t: number[]; mine: number[]; bench: number[] } {
  const grid = series.SPY?.t ?? [];
  const at = (s: Series, t: number) => {
    let lo = 0, hi = s.t.length - 1;
    if (t <= s.t[0]) return s.c[0];
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s.t[m] <= t) lo = m; else hi = m - 1; }
    return s.c[lo];
  };
  const wsum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const mine = grid.map((t) => {
    let v = 0;
    for (const [k, w] of Object.entries(weights)) {
      const s = series[k];
      if (s) v += (w / wsum) * (at(s, t) / at(s, grid[0]) - 1) * 100;
    }
    return v;
  });
  const spy = series.SPY;
  const bench = grid.map((_, i) => (spy.c[i] / spy.c[0] - 1) * 100);
  return { t: grid, mine, bench };
}
