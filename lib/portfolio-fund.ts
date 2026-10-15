/* The whole portfolio seen as one "fund" (FundData), so the ETF deep-view tabs
   (Composition Map, Charts / seasonality, News) work for it unchanged.
   Look-through: every ETF is opened up into its holdings and weighted by its share of the portfolio;
   single stocks count directly. Pure function — safe on the server (news API) and in the browser. */

import { buildFund } from "@/components/deep-view/buildFund";
import type { FundData, Holding, HoldingMeta, Tf } from "@/components/deep-view/types";

export interface PItem { ticker: string; name: string; weight: number; kind: "etf" | "stock"; sector: string; price?: number; chg1d?: number; ytd?: number }

const norm = (t: string) => (t === "GOOG" ? "GOOGL" : t);
const TFS: Tf[] = ["1D", "1W", "2W", "1M", "3M", "YTD", "1Y", "3Y", "5Y"];

export function buildPortfolioFund(items: PItem[]): FundData {
  const W = items.reduce((a, i) => a + i.weight, 0) || 1;
  const hold = new Map<string, Holding>();
  const meta: Record<string, HoldingMeta> = {};
  const sectors: Record<string, number> = {};
  const parent: Record<string, string> = {};
  const geo: Record<string, number> = {};
  const perf = Object.fromEntries(TFS.map((t) => [t, 0])) as Record<Tf, number>;
  const seas = new Map<number, { sum: number[]; w: number[] }>();
  let ter = 0, day = 0;

  for (const it of items) {
    const w = it.weight / W; // fraction of the portfolio
    const f = it.kind === "etf" ? buildFund(it.ticker) : null;
    if (f) {
      for (const h of f.holdings) {
        const k = norm(h.tic), cur = hold.get(k);
        if (cur) cur.w += (w * h.w); else hold.set(k, { tic: k, name: h.name, w: w * h.w });
        if (f.holdingMeta[h.tic]) meta[k] = f.holdingMeta[h.tic];
      }
      for (const [s, p] of f.sectors) { sectors[s] = (sectors[s] ?? 0) + w * p; parent[s] = f.sectorParent[s] ?? "Other"; }
      for (const [g, p] of f.geo) geo[g] = (geo[g] ?? 0) + w * p;
      for (const t of TFS) perf[t] += w * f.perf[t];
      for (const [y, months] of f.seasonality) {
        const e = seas.get(y) ?? { sum: Array(12).fill(0), w: Array(12).fill(0) };
        months.forEach((v, m) => { if (v != null) { e.sum[m] += w * v; e.w[m] += w; } });
        seas.set(y, e);
      }
      ter += w * f.ter;
      day += w * f.dayPct;
    } else {
      // single stock (or a fund we have no holdings for): one holding, its own sector
      const k = norm(it.ticker), cur = hold.get(k);
      if (cur) cur.w += w * 100; else hold.set(k, { tic: k, name: it.name, w: w * 100 });
      meta[k] = meta[k] ?? { sector: it.sector || "Other", capB: 100 };
      const sec = it.sector || "Other";
      sectors[sec] = (sectors[sec] ?? 0) + w * 100;
      parent[sec] = parent[sec] ?? sec;
      geo["United States"] = (geo["United States"] ?? 0) + w * 100;
      const ytd = it.ytd ?? 0, d = it.chg1d ?? 0;
      const est: Record<Tf, number> = { "1D": d, "1W": ytd / 40, "2W": ytd / 20, "1M": ytd / 9, "3M": ytd / 3, YTD: ytd, "1Y": ytd * 1.3, "3Y": ytd * 3, "5Y": ytd * 5 };
      for (const t of TFS) perf[t] += w * est[t];
      day += w * d;
    }
  }

  const holdings = [...hold.values()].map((h) => ({ ...h, w: +h.w.toFixed(2) })).sort((a, b) => b.w - a.w);
  const secList = Object.entries(sectors).map(([s, p]) => [s, +p.toFixed(1)] as [string, number]).sort((a, b) => b[1] - a[1]);
  const seasonality = [...seas.entries()].sort((a, b) => a[0] - b[0])
    .map(([y, e]) => [y, e.sum.map((v, m) => (e.w[m] ? +(v / e.w[m]).toFixed(1) : null))] as [number, (number | null)[]]);
  const top = holdings.slice(0, 2);

  return {
    tic: "PORTFOLIO",
    name: "My portfolio",
    category: "PORTFOLIO",
    price: 100 * (1 + perf.YTD / 100),
    dayPct: +day.toFixed(2),
    aumB: 0,
    ter,
    meta: [],
    holdings,
    holdingMeta: meta,
    geo: Object.entries(geo).map(([g, p]) => [g, +p.toFixed(1)] as [string, number]).sort((a, b) => b[1] - a[1]),
    sectors: secList,
    sectorParent: parent,
    risk: [],
    stats: { aumB: 0, ter, divYield: 0, navPrem: 0, beta: 1, vol30d: 0, sharpe: 0, maxDD: 0 },
    alts: [],
    seasonality,
    perf,
    volMul: 1,
    nav: [0, 0],
    aiNote: `Look-through: ${top.map((x) => `${x.tic} ${x.w.toFixed(1)}%`).join(", ")} are your largest underlying exposures.`,
    positions: holdings.length,
  };
}
