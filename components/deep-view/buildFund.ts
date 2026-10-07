/* Builds the Deep View `FundData` for any ticker in lib/etfs.ts from the composition
   profiles in lib/fund-profiles.ts. Everything here is deterministic placeholder data —
   swap this function for an API call later and keep the FundData shape. */

import { CATEGORIES, ETFS, fmtAum } from "@/lib/etfs";
import { EQUAL_WEIGHT, PROFILE_OF, QUOTE, SUB_PARENT } from "@/lib/fund-profiles";
import type { FundData, Holding, HoldingMeta, Tf } from "./types";
import { hash01, seeded } from "./utils";

const UCITS_EXCHANGES = new Set(["Xetra", "LSE", "Euronext"]);
const VOL = { Low: 0.8, Medium: 1.15, High: 1.7 } as const;

export const DEEP_VIEW_TICKERS = ETFS.filter((e) => PROFILE_OF[e.ticker] && QUOTE[e.ticker]).map((e) => e.ticker);

export function buildFund(rawTicker: string): FundData | null {
  const tic = rawTicker.toUpperCase();
  const etf = ETFS.find((e) => e.ticker === tic);
  const profile = PROFILE_OF[tic];
  const quote = QUOTE[tic];
  if (!etf || !profile || !quote) return null;

  const [price, ter] = quote;
  const h = (k: string) => hash01(tic + k);
  const lev = etf.leverage === "3x" ? 3 : etf.leverage === "2x" ? 2 : etf.leverage === "Inverse" ? -3 : 1;
  const levF = Math.abs(lev) > 1 ? 2.3 : 1;
  const V = VOL[etf.volatility];

  /* ── Holdings ── */
  const parsed = profile.holdings.map((line) => {
    const [t, name, w, sector, cap] = line.split("|");
    return { tic: t, name, w: Number(w), sector, capB: Number(cap) };
  });
  const positions = profile.positions ?? parsed.length;
  if (EQUAL_WEIGHT.has(tic)) {
    const base = 100 / positions;
    parsed.forEach((p, i) => (p.w = +(base * (1.12 - i * 0.008 + (hash01(p.tic) - 0.5) * 0.1)).toFixed(2)));
  }
  parsed.sort((a, b) => b.w - a.w);
  const holdings: Holding[] = parsed.map(({ tic: t, name, w }) => ({ tic: t, name, w }));
  const holdingMeta: Record<string, HoldingMeta> = Object.fromEntries(parsed.map((p) => [p.tic, { sector: p.sector, capB: p.capB }]));

  /* ── Sector split ── */
  let sectors: [string, number][];
  if (profile.sectors && !EQUAL_WEIGHT.has(tic)) {
    const total = profile.sectors.reduce((a, [, v]) => a + v, 0);
    sectors = profile.sectors.map(([n, v]) => [n, +((v / total) * 100).toFixed(1)]);
  } else if (profile.sectors) {
    sectors = profile.sectors.map(([n, v]) => [n, v]);
  } else {
    const agg: Record<string, number> = {};
    parsed.forEach((p) => (agg[p.sector] = (agg[p.sector] ?? 0) + p.w));
    const covered = Object.values(agg).reduce((a, v) => a + v, 0);
    if (covered < 99.5) agg["Other Holdings"] = 100 - covered;
    sectors = Object.entries(agg).map(([n, v]) => [n, +v.toFixed(1)]);
  }
  sectors.sort((a, b) => b[1] - a[1]);
  const sectorParent = Object.fromEntries(sectors.map(([n]) => [n, SUB_PARENT[n] ?? "Other"]));

  const parentTotals: Record<string, number> = {};
  sectors.forEach(([n, v]) => (parentTotals[sectorParent[n]] = (parentTotals[sectorParent[n]] ?? 0) + v));
  const topParent = Object.entries(parentTotals).sort((a, b) => b[1] - a[1])[0][0];

  /* ── Performance per timeframe ── */
  const clampPct = (v: number) => Math.max(-96, +v.toFixed(2));
  const perf: Record<Tf, number> = {
    "1D": etf.chg1d,
    "1W": clampPct(etf.chg1d * 1.6 + (h("1w") - 0.5) * 2.4 * V * levF),
    "1M": clampPct(etf.ytd / 9 + (h("1m") - 0.5) * 5 * V * levF),
    YTD: etf.ytd,
    "1Y": clampPct(etf.ytd * 1.25 + (h("1y") - 0.5) * 8 * V),
    "5Y": clampPct(lev < 0 ? -88 - h("5y") * 6 : etf.ytd * 3.4 + 28 * V * levF * (0.6 + h("5y"))),
  };

  /* ── Risk tiles ── */
  const dd = -Math.min(95, (14 + 16 * V) * levF + h("dd") * 6);
  const beta = profile.beta * lev + (h("beta") - 0.5) * 0.1;
  const sharpe = Math.max(-1.5, Math.min(3.2, (etf.ytd / 100) / (0.14 * V * levF) + 0.2));

  /* ── Cheaper peers with the same composition ── */
  const alts = ETFS.filter((e) => e.ticker !== tic && PROFILE_OF[e.ticker] === profile && QUOTE[e.ticker] && QUOTE[e.ticker][1] < ter)
    .map((e) => ({ tic: e.ticker, name: e.name, ter: QUOTE[e.ticker][1] }))
    .sort((a, b) => a.ter - b.ter)
    .slice(0, 3);

  /* ── Seasonality 2023–2026 (through Sep) ── */
  const rnd = seeded(Math.floor(h("seas") * 1e9));
  const amp = 6 * V * levF;
  const drift = etf.ytd / 12 / 3;
  const seasonality: [number, (number | null)[]][] = [2023, 2024, 2025, 2026].map((y) => [
    y,
    Array.from({ length: 12 }, (_, m) => (y === 2026 && m > 8 ? null : +((rnd() - 0.47) * amp + drift).toFixed(1))),
  ]);

  const cat = CATEGORIES.find((c) => c.id === etf.category)?.label ?? "ETF";
  const premium = +((h("nav") - 0.5) * 0.12).toFixed(2);
  const top2 = holdings.slice(0, 2);
  const top2w = top2.reduce((a, x) => a + x.w, 0);

  const meta: [string, string][] = [
    ["EXPENSE RATIO", ter.toFixed(Math.abs(ter * 100 - Math.round(ter * 100)) > 1e-6 ? 4 : 2) + "%"],
    ["CURRENCY", etf.currency],
    ["DOMICILE", UCITS_EXCHANGES.has(etf.exchange) ? "Ireland" : "United States"],
    ["ASSETS (AUM)", fmtAum(etf.aum)],
    ["PRIMARY SECTOR", topParent],
    ["SUB-SECTOR", sectors[0][0]],
  ];
  if (lev !== 1) meta.push(["LEVERAGE", lev < 0 ? "-3x daily" : `${lev}x daily`]);

  return {
    tic,
    name: etf.name,
    category: `${cat} / ${etf.sector}`,
    price,
    dayPct: etf.chg1d,
    aumB: etf.aum,
    ter,
    meta,
    holdings,
    holdingMeta,
    geo: profile.geo,
    sectors,
    sectorParent,
    risk: [
      ["MAX DRAWDOWN", dd.toFixed(1) + "%", true],
      ["BETA", beta.toFixed(2)],
      ["SHARPE RATIO", sharpe.toFixed(2)],
      ["DIV YIELD", etf.dividendYield.toFixed(2) + "%"],
    ],
    alts,
    seasonality,
    perf,
    volMul: V * levF,
    nav: [+(price / (1 + premium / 100)).toFixed(2), premium],
    positions,
    aiNote: `${tic} concentration check: ${top2.map((x) => x.tic).join(" + ")} make up ${top2w.toFixed(1)}% of NAV. ${topParent} exposure ${parentTotals[topParent].toFixed(0)}%. Overlap vs SPY and QQQ, factor tilt and a suggested hedge ratio are available in Inferno Pro.`,
  };
}
