"use client";

/* Global index universe for the [ INDEXES ] map mode.
   Each index has a direct Yahoo symbol and a liquid single-country / index ETF proxy.
   useIndexSeries() fetches both for the picked timeframe and silently falls back to the
   proxy when the index series is missing, empty or too short. */

import { useEffect, useState } from "react";

export type IdxTf = "1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y";
export const IDX_TFS: IdxTf[] = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "5Y"];
const RANGE: Record<IdxTf, string> = { "1D": "1d", "1W": "5d", "1M": "1mo", "3M": "3mo", "6M": "1y", YTD: "ytd", "1Y": "1y", "5Y": "5y" };
/** 6M is cut out of the 1-year daily series */
const CUT_DAYS: Partial<Record<IdxTf, number>> = { "6M": 182 };

export interface IndexDef { id: string; name: string; country: string; sym: string; proxy: string; ccy: string; tier: "core" | "em" }

export const INDEXES: IndexDef[] = [
  { id: "SPX", name: "S&P 500", country: "US", sym: "^GSPC", proxy: "SPY", ccy: "USD", tier: "core" },
  { id: "NDX", name: "Nasdaq 100", country: "US", sym: "^NDX", proxy: "QQQ", ccy: "USD", tier: "core" },
  { id: "DJI", name: "Dow Jones 30", country: "US", sym: "^DJI", proxy: "DIA", ccy: "USD", tier: "core" },
  { id: "DAX", name: "DAX 40", country: "DE", sym: "^GDAXI", proxy: "EWG", ccy: "EUR", tier: "core" },
  { id: "UKX", name: "FTSE 100", country: "UK", sym: "^FTSE", proxy: "EWU", ccy: "GBP", tier: "core" },
  { id: "N225", name: "Nikkei 225", country: "JP", sym: "^N225", proxy: "EWJ", ccy: "JPY", tier: "core" },
  { id: "SX5E", name: "Euro Stoxx 50", country: "EU", sym: "^STOXX50E", proxy: "FEZ", ccy: "EUR", tier: "core" },
  { id: "WIG20", name: "WIG20", country: "PL", sym: "WIG20.WA", proxy: "EPOL", ccy: "PLN", tier: "core" },
  { id: "NIFTY", name: "Nifty 50", country: "IN", sym: "^NSEI", proxy: "INDA", ccy: "INR", tier: "em" },
  { id: "IBOV", name: "Bovespa", country: "BR", sym: "^BVSP", proxy: "EWZ", ccy: "BRL", tier: "em" },
  { id: "KOSPI", name: "KOSPI", country: "KR", sym: "^KS11", proxy: "EWY", ccy: "KRW", tier: "em" },
  { id: "HSI", name: "Hang Seng", country: "HK", sym: "^HSI", proxy: "EWH", ccy: "HKD", tier: "em" },
  { id: "CSI300", name: "CSI 300", country: "CN", sym: "000300.SS", proxy: "MCHI", ccy: "CNY", tier: "em" },
  { id: "MEXBOL", name: "IPC Mexico", country: "MX", sym: "^MXX", proxy: "EWW", ccy: "MXN", tier: "em" },
  // Yahoo has no reliable VN-Index feed → the ETF is the source
  { id: "VNM", name: "Vietnam (VNM ETF)", country: "VN", sym: "VNM", proxy: "VNM", ccy: "USD", tier: "em" },
];

export type Series = { t: number[]; c: number[] };
export interface IndexSeries { def: IndexDef; s: Series | null; viaProxy: boolean; ret: number | null; last: number | null }

async function fetchSeries(syms: string[], range: string): Promise<Record<string, Series | null>> {
  const out: Record<string, Series | null> = {};
  for (let i = 0; i < syms.length; i += 20) {
    try {
      const j = await fetch(`/api/prices?symbols=${encodeURIComponent(syms.slice(i, i + 20).join(","))}&range=${range}`).then((r) => r.json());
      Object.assign(out, j.series ?? {});
    } catch { /* offline → stays empty */ }
  }
  return out;
}

const usable = (s: Series | null | undefined, tf: IdxTf) => !!s && s.c.length >= (tf === "1D" ? 5 : 3) && s.c.every((v) => Number.isFinite(v));

export function useIndexSeries(defs: IndexDef[], tf: IdxTf) {
  const key = `${tf}:${defs.map((d) => d.id).join(",")}`;
  const [st, setSt] = useState<{ key: string; rows: IndexSeries[] } | null>(null);
  useEffect(() => {
    let off = false;
    (async () => {
      const syms = [...new Set(defs.flatMap((d) => [d.sym, d.proxy]))];
      const got = await fetchSeries(syms, RANGE[tf]);
      const cut = CUT_DAYS[tf] ? Date.now() / 1000 - CUT_DAYS[tf]! * 86400 : 0;
      const trim = (s: Series): Series => { if (!cut) return s; const k = s.t.findIndex((t) => t >= cut); return k > 0 ? { t: s.t.slice(k), c: s.c.slice(k) } : s; };
      const rows = defs.map((def) => {
        const direct = got[def.sym.toUpperCase()], proxy = got[def.proxy.toUpperCase()];
        const viaProxy = !usable(direct, tf) && usable(proxy, tf) && def.proxy !== def.sym;
        const raw = viaProxy ? proxy : usable(direct, tf) ? direct : null;
        const s = raw ? trim(raw) : null;
        const ret = s ? (s.c[s.c.length - 1] / s.c[0] - 1) * 100 : null;
        return { def, s, viaProxy, ret, last: s ? s.c[s.c.length - 1] : null };
      });
      if (!off) setSt({ key, rows });
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures defs + timeframe
  }, [key]);
  return st?.key === key ? st.rows : null;
}
