/* Portfolio prompt parsing + look-through analytics for the Portfolio dashboard.
   All numbers are illustrative placeholders built on lib/etfs.ts + lib/fund-profiles.ts. */

import { ETFS } from "@/lib/etfs";
import { PROFILE_OF, QUOTE, SUB_PARENT } from "@/lib/fund-profiles";

export interface Asset {
  ticker: string;
  name: string;
  price: number;
  chg1d: number;
  ytd: number;
  sector: string;
  kind: "etf" | "stock";
  /** Approx. peak-to-trough loss in 2022, % (negative) */
  dd2022: number;
}

/** A few single stocks people commonly mix in (e.g. "VOO QQQ NVDA"). */
const STOCKS: Asset[] = [
  { ticker: "NVDA", name: "NVIDIA Corp", price: 128.4, chg1d: 3.1, ytd: 34.2, sector: "Technology", kind: "stock", dd2022: -66 },
  { ticker: "AAPL", name: "Apple Inc.", price: 226.5, chg1d: 0.4, ytd: 9.8, sector: "Technology", kind: "stock", dd2022: -31 },
  { ticker: "MSFT", name: "Microsoft Corp", price: 432.1, chg1d: 0.6, ytd: 12.4, sector: "Technology", kind: "stock", dd2022: -37 },
  { ticker: "TSLA", name: "Tesla Inc.", price: 248.1, chg1d: -1.8, ytd: -4.2, sector: "Consumer", kind: "stock", dd2022: -73 },
  { ticker: "AMZN", name: "Amazon.com", price: 198.3, chg1d: 0.9, ytd: 11.6, sector: "Consumer", kind: "stock", dd2022: -56 },
  { ticker: "META", name: "Meta Platforms", price: 590.2, chg1d: 1.2, ytd: 24.1, sector: "Communication", kind: "stock", dd2022: -76 },
  { ticker: "GOOGL", name: "Alphabet Inc.", price: 172.4, chg1d: 0.3, ytd: 8.9, sector: "Communication", kind: "stock", dd2022: -44 },
];

/** Rough 2022 drawdowns for funds whose index we know; others fall back to volatility. */
const DD2022: Record<string, number> = {
  SPY: -25, VOO: -25, IVV: -25, CSPX: -25, VTI: -26, RSP: -21, QQQ: -35, TQQQ: -79, SQQQ: 40, IWM: -31, DIA: -21,
  VT: -26, ACWI: -26, VWCE: -26, EUNL: -25, IWDA: -25, VEA: -27, IEFA: -27, VXUS: -27, VGK: -29, EEM: -30, VWO: -27,
  MCHI: -40, FXI: -36, SCHD: -15, SMH: -45, SOXX: -47, SOXL: -86, XLK: -33, VGT: -35, IGV: -44, ARKK: -67, TLT: -36,
  GLD: -20, IAU: -20, SLV: -30, DBC: -12, USO: -35, XLE: -14, VDE: -15, XOP: -25, XLF: -24, XLV: -14, XLP: -12, XLU: -16,
  IBIT: -76, FBTC: -76, ETHA: -80,
};
const DD_BY_VOL = { Low: -18, Medium: -28, High: -42 } as const;

export function getAsset(ticker: string): Asset | null {
  const t = ticker.toUpperCase();
  const stock = STOCKS.find((s) => s.ticker === t);
  if (stock) return stock;
  const e = ETFS.find((x) => x.ticker === t);
  if (!e || !QUOTE[t]) return null;
  const lev = e.leverage === "3x" ? 3 : 1;
  return {
    ticker: t,
    name: e.name,
    price: QUOTE[t][0],
    chg1d: e.chg1d,
    ytd: e.ytd,
    sector: e.sector,
    kind: "etf",
    dd2022: DD2022[t] ?? Math.max(-90, DD_BY_VOL[e.volatility] * lev),
  };
}

export interface Position { asset: Asset; weight: number }
export interface ParseResult {
  positions: Position[];
  errors: string[];
  /** Sum of weights in % */
  total: number;
  valid: boolean;
}

/** Parses "VOO QQQ NVDA 40/40/20", "VOO 40 QQQ 40 NVDA 20", "VOO, QQQ" (equal weight). */
export function parsePortfolio(input: string): ParseResult {
  const tokens = input.toUpperCase().replace(/[,;+]/g, " ").split(/\s+/).filter(Boolean);
  const tickers: string[] = [];
  const weights: number[] = [];
  const errors: string[] = [];

  for (const tok of tokens) {
    const clean = tok.replace(/%$/, "");
    if (/^\d+(\.\d+)?(\/\d+(\.\d+)?)+$/.test(clean)) weights.push(...clean.split("/").map(Number));
    else if (/^\d+(\.\d+)?$/.test(clean)) weights.push(Number(clean));
    else if (/^[A-Z][A-Z0-9.]{0,6}$/.test(clean)) tickers.push(clean);
  }

  const unknown = tickers.filter((t) => !getAsset(t));
  if (unknown.length) errors.push(`Unknown ticker: ${unknown.join(", ")}`);

  const known = tickers.filter((t) => getAsset(t));
  let w: number[];
  if (weights.length === 0) w = known.map(() => +(100 / Math.max(1, known.length)).toFixed(2));
  else if (weights.length === tickers.length) w = tickers.map((t, i) => (getAsset(t) ? weights[i] : NaN)).filter((x) => !Number.isNaN(x));
  else {
    errors.push(`${tickers.length} tickers but ${weights.length} weights`);
    w = known.map(() => +(100 / Math.max(1, known.length)).toFixed(2));
  }

  const positions = known.map((t, i) => ({ asset: getAsset(t)!, weight: w[i] ?? 0 }));
  const total = positions.reduce((a, p) => a + p.weight, 0);
  if (positions.length && Math.abs(total - 100) > 0.5) errors.push(`Weights add up to ${total.toFixed(1)}%, not 100%`);
  return { positions, errors, total, valid: positions.length > 0 && errors.length === 0 };
}

/** Underlying single-name exposure (look-through) in % of the portfolio. */
function lookThrough(positions: Position[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { asset, weight } of positions) {
    if (asset.kind === "stock") { out[asset.ticker] = (out[asset.ticker] ?? 0) + weight; continue; }
    const prof = PROFILE_OF[asset.ticker];
    if (!prof) continue;
    for (const line of prof.holdings) {
      const [t, , w] = line.split("|");
      const key = t === "GOOG" ? "GOOGL" : t;
      out[key] = (out[key] ?? 0) + (weight * Number(w)) / 100;
    }
  }
  return out;
}

function holdingsOf(a: Asset): Record<string, number> {
  if (a.kind === "stock") return { [a.ticker]: 100 };
  const out: Record<string, number> = {};
  for (const line of PROFILE_OF[a.ticker]?.holdings ?? []) {
    const [t, , w] = line.split("|");
    const key = t === "GOOG" ? "GOOGL" : t;
    out[key] = (out[key] ?? 0) + Number(w);
  }
  return out;
}

export interface Roast {
  score: number;
  tier: string;
  nextTier: string | null;
  toNext: number;
  overlap: { pair: string; pct: number };
  top10: number;
  drawdown: number;
}

const TIERS: [number, string][] = [[0, "Ash"], [25, "Ember"], [40, "Smolder"], [60, "Blaze"], [80, "Inferno"]];

export function roastPortfolio(positions: Position[]): Roast {
  // Highest pairwise overlap (sum of min weights over shared names).
  let overlap = { pair: "—", pct: 0 };
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = holdingsOf(positions[i].asset), b = holdingsOf(positions[j].asset);
      let s = 0;
      for (const k of Object.keys(a)) if (b[k]) s += Math.min(a[k], b[k]);
      if (s > overlap.pct) overlap = { pair: `${positions[i].asset.ticker} / ${positions[j].asset.ticker}`, pct: s };
    }
  }

  const lt = Object.values(lookThrough(positions)).sort((x, y) => y - x);
  const top10 = Math.min(100, lt.slice(0, 10).reduce((a, v) => a + v, 0));
  const drawdown = positions.reduce((a, p) => a + (p.weight / 100) * p.asset.dd2022, 0);

  const penalty = overlap.pct * 0.45 + Math.max(0, top10 - 25) * 0.55 + Math.abs(Math.min(0, drawdown)) * 0.6 + Math.max(0, -drawdown - 40) * 0.6;
  const score = positions.length ? Math.max(1, Math.min(99, Math.round(100 - penalty))) : 0;
  let tier = TIERS[0][1], nextTier: string | null = null, toNext = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (score >= TIERS[i][0]) {
      tier = TIERS[i][1];
      nextTier = TIERS[i + 1]?.[1] ?? null;
      toNext = TIERS[i + 1] ? TIERS[i + 1][0] - score : 0;
    }
  }
  return { score, tier, nextTier, toNext, overlap, top10, drawdown };
}

/** Example prompts (also used by Builder / Whales). */
export const PRESETS = {
  classic: "VOO QQQ NVDA 40/40/20",
  retire2045: "VT SCHD TLT 60/20/20",
  dalio: "VTI TLT GLD DBC 30/40/15/15",
};

/* ── Saved portfolio (per browser) ── */

const STORAGE_KEY = "inferno.portfolio.v1";
export interface SavedPortfolio { prompt: string; createdAt: string }

export function loadPortfolio(): SavedPortfolio | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedPortfolio) : null;
  } catch {
    return null;
  }
}

export function savePortfolio(prompt: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ prompt, createdAt: new Date().toISOString() }));
  } catch {
    /* storage unavailable — portfolio lives only for this visit */
  }
}

export function clearPortfolio() {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/* ── Deep View analytics (illustrative placeholders) ── */


export type AssetClass = "equity" | "bond" | "gold" | "commodity" | "crypto" | "fx";

export function assetClass(a: Asset): AssetClass {
  if (a.kind === "stock") return "equity";
  if (["TLT"].includes(a.ticker)) return "bond";
  if (["GLD", "IAU", "SLV"].includes(a.ticker)) return "gold";
  if (["DBC", "USO", "DBA"].includes(a.ticker)) return "commodity";
  if (["IBIT", "FBTC", "ETHA"].includes(a.ticker)) return "crypto";
  if (["UUP"].includes(a.ticker)) return "fx";
  return "equity";
}

/** Look-through exposure by parent sector, split by the position that contributes it. */
export function sectorExposure(positions: Position[]) {
  const map: Record<string, { total: number; by: Record<string, number> }> = {};
  const add = (sector: string, ticker: string, v: number) => {
    const s = (map[sector] ??= { total: 0, by: {} });
    s.total += v;
    s.by[ticker] = (s.by[ticker] ?? 0) + v;
  };
  for (const { asset, weight } of positions) {
    if (asset.kind === "stock") { add(asset.sector === "Consumer" ? "Consumer Disc." : asset.sector, asset.ticker, weight); continue; }
    const prof = PROFILE_OF[asset.ticker];
    if (!prof) continue;
    if (prof.sectors) {
      const tot = prof.sectors.reduce((a, [, v]) => a + v, 0);
      prof.sectors.forEach(([sub, v]) => add(SUB_PARENT[sub] ?? "Other", asset.ticker, (weight * v) / tot));
    } else {
      const lines = prof.holdings.map((l) => l.split("|"));
      const tot = lines.reduce((a, l) => a + Number(l[2]), 0);
      lines.forEach((l) => add(SUB_PARENT[l[3]] ?? "Other", asset.ticker, (weight * Number(l[2])) / tot));
    }
  }
  return Object.entries(map)
    .map(([sector, v]) => ({ sector, ...v }))
    .sort((a, b) => b.total - a.total);
}

/** Pairwise correlation estimate (asset-class baseline, nudged by holdings overlap). */
export function correlationMatrix(positions: Position[]) {
  const base: Record<string, number> = {
    "equity|equity": 0.78, "equity|bond": -0.22, "equity|gold": 0.08, "equity|commodity": 0.32, "equity|crypto": 0.46, "equity|fx": -0.3,
    "bond|bond": 0.9, "bond|gold": 0.28, "bond|commodity": -0.12, "bond|crypto": -0.05, "bond|fx": 0.05,
    "gold|gold": 0.92, "gold|commodity": 0.35, "gold|crypto": 0.18, "gold|fx": -0.4,
    "commodity|commodity": 0.8, "commodity|crypto": 0.2, "commodity|fx": -0.25,
    "crypto|crypto": 0.9, "crypto|fx": -0.15, "fx|fx": 1,
  };
  const key = (a: AssetClass, b: AssetClass) => base[`${a}|${b}`] ?? base[`${b}|${a}`] ?? 0;
  return positions.map((pi) =>
    positions.map((pj) => {
      if (pi === pj) return 1;
      const a = holdingsOf(pi.asset), b = holdingsOf(pj.asset);
      let ov = 0;
      for (const k of Object.keys(a)) if (b[k]) ov += Math.min(a[k], b[k]);
      const c = key(assetClass(pi.asset), assetClass(pj.asset)) + (ov / 100) * 0.35;
      return Math.max(-1, Math.min(0.99, +c.toFixed(2)));
    })
  );
}

/** Historical stress scenarios: per-class multipliers applied to each asset's 2022 drawdown. */
export const SCENARIOS = [
  { id: "gfc", label: "2008 GFC", months: 17, mult: { equity: 1.55, bond: -0.75, gold: -0.25, commodity: 2.6, crypto: 1.0, fx: -0.6 } },
  { id: "covid", label: "2020 COVID", months: 2, mult: { equity: 0.85, bond: -0.4, gold: 0.4, commodity: 2.0, crypto: 0.6, fx: -0.3 } },
  { id: "rates", label: "2022 RATES", months: 9, mult: { equity: 1, bond: 1, gold: 1, commodity: 1, crypto: 1, fx: 1 } },
] as const;
export type ScenarioId = (typeof SCENARIOS)[number]["id"];

export function scenarioLoss(positions: Position[], id: ScenarioId) {
  const sc = SCENARIOS.find((s) => s.id === id)!;
  const per = positions.map((p) => {
    const cls = assetClass(p.asset);
    const dd = Math.max(-95, Math.min(60, p.asset.dd2022 * sc.mult[cls]));
    return { ticker: p.asset.ticker, dd, contrib: (p.weight / 100) * dd };
  });
  return { total: per.reduce((a, x) => a + x.contrib, 0), per };
}

/** 24-month index path (start 100): fall to the trough, then recover. */
export function drawdownPath(trough: number, monthsDown: number) {
  const n = 24, pts: number[] = [];
  const down = Math.max(1, Math.min(18, monthsDown));
  for (let i = 0; i < n; i++) {
    if (i <= down) pts.push(100 * (1 + (trough / 100) * Math.sin(((i / down) * Math.PI) / 2)));
    else {
      const f = (i - down) / (n - 1 - down);
      pts.push(100 * (1 + trough / 100) + (100 * (-trough / 100) * 0.85) * (1 - Math.pow(1 - f, 2)));
    }
  }
  return pts;
}

/** Top underlying names of one position, scaled to its portfolio weight. */
export function drillDown(p: Position, n = 6) {
  if (p.asset.kind === "stock") return [{ ticker: p.asset.ticker, name: p.asset.name, inFund: 100, inPortfolio: p.weight }];
  const lines = (PROFILE_OF[p.asset.ticker]?.holdings ?? []).map((l) => l.split("|"));
  return lines
    .map(([t, name, w]) => ({ ticker: t, name, inFund: Number(w), inPortfolio: (p.weight * Number(w)) / 100 }))
    .sort((a, b) => b.inFund - a.inFund)
    .slice(0, n);
}
