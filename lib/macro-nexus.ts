/* Cross-asset correlation data for the Macro Nexus (ETF Tools → Correlation Network).
 *
 * MOCK DATA — illustrative, not live market data. Correlations come from a small factor model
 * (each ETF loads on a few macro factors + its own idiosyncratic noise), so the matrix is always
 * internally consistent (positive semi-definite), unlike hand-typed numbers. Swap `correlations()`
 * for real return correlations later and keep the same shapes. */

export type Window = "30D" | "90D" | "1Y";
export const WINDOWS: Window[] = ["30D", "90D", "1Y"];

export type Group = "EQUITY" | "TECH" | "CYCLICAL" | "ENERGY" | "DEFENSE" | "METALS" | "RATES" | "CREDIT" | "FX" | "REAL ASSETS" | "INTL" | "CRYPTO";

export interface NexusNode { id: string; ticker: string; name: string; group: Group }
export interface NexusLink { source: string; target: string; correlation_value: number }

/* Factors: EQ broad equity · GRW growth/duration-equity · CYC cyclical/value · RATE bond rally ·
   INFL commodity/inflation · GOLD precious metals · USD dollar · DEF defense budgets · CRY crypto */
type F = "EQ" | "GRW" | "CYC" | "RATE" | "INFL" | "GOLD" | "USD" | "DEF" | "CRY";
const FACTORS: F[] = ["EQ", "GRW", "CYC", "RATE", "INFL", "GOLD", "USD", "DEF", "CRY"];

const ASSETS: (NexusNode & { load: Partial<Record<F, number>>; idio: number })[] = [
  { id: "SPY", ticker: "SPY", name: "S&P 500", group: "EQUITY", load: { EQ: 1, GRW: 0.3, CYC: 0.2 }, idio: 0.12 },
  { id: "QQQ", ticker: "QQQ", name: "Nasdaq 100", group: "TECH", load: { EQ: 0.95, GRW: 0.7, RATE: 0.08 }, idio: 0.18 },
  { id: "XLK", ticker: "XLK", name: "Technology", group: "TECH", load: { EQ: 0.9, GRW: 0.8 }, idio: 0.25 },
  { id: "SMH", ticker: "SMH", name: "Semiconductors", group: "TECH", load: { EQ: 0.9, GRW: 0.9 }, idio: 0.45 },
  { id: "IWM", ticker: "IWM", name: "Russell 2000", group: "CYCLICAL", load: { EQ: 0.95, CYC: 0.5 }, idio: 0.35 },
  { id: "XLF", ticker: "XLF", name: "Financials", group: "CYCLICAL", load: { EQ: 0.85, CYC: 0.6, RATE: -0.25 }, idio: 0.35 },
  { id: "XLB", ticker: "XLB", name: "Materials", group: "CYCLICAL", load: { EQ: 0.75, CYC: 0.4, INFL: 0.35 }, idio: 0.4 },
  { id: "XLE", ticker: "XLE", name: "Energy", group: "ENERGY", load: { EQ: 0.5, CYC: 0.4, INFL: 0.8 }, idio: 0.4 },
  { id: "USO", ticker: "USO", name: "Crude Oil", group: "ENERGY", load: { EQ: 0.2, INFL: 1 }, idio: 0.5 },
  { id: "ITA", ticker: "ITA", name: "Aerospace & Defense", group: "DEFENSE", load: { EQ: 0.65, CYC: 0.2, DEF: 0.7 }, idio: 0.35 },
  { id: "XAR", ticker: "XAR", name: "Defense (eq. weight)", group: "DEFENSE", load: { EQ: 0.6, DEF: 0.75 }, idio: 0.45 },
  { id: "GLD", ticker: "GLD", name: "Gold", group: "METALS", load: { GOLD: 1, USD: -0.35, RATE: 0.2 }, idio: 0.25 },
  { id: "SLV", ticker: "SLV", name: "Silver", group: "METALS", load: { GOLD: 0.9, INFL: 0.3, EQ: 0.2 }, idio: 0.5 },
  { id: "GDX", ticker: "GDX", name: "Gold Miners", group: "METALS", load: { GOLD: 0.9, EQ: 0.35 }, idio: 0.55 },
  { id: "TLT", ticker: "TLT", name: "20Y+ Treasuries", group: "RATES", load: { RATE: 1, EQ: -0.25 }, idio: 0.15 },
  { id: "IEF", ticker: "IEF", name: "7–10Y Treasuries", group: "RATES", load: { RATE: 0.9, EQ: -0.15 }, idio: 0.12 },
  { id: "HYG", ticker: "HYG", name: "High Yield", group: "CREDIT", load: { EQ: 0.55, CYC: 0.2, RATE: 0.35 }, idio: 0.35 },
  { id: "UUP", ticker: "UUP", name: "US Dollar", group: "FX", load: { USD: 1, EQ: -0.25 }, idio: 0.3 },
  { id: "XLU", ticker: "XLU", name: "Utilities", group: "REAL ASSETS", load: { EQ: 0.45, RATE: 0.5 }, idio: 0.45 },
  { id: "VNQ", ticker: "VNQ", name: "REITs", group: "REAL ASSETS", load: { EQ: 0.7, RATE: 0.5 }, idio: 0.4 },
  { id: "EEM", ticker: "EEM", name: "Emerging Markets", group: "INTL", load: { EQ: 0.8, CYC: 0.3, USD: -0.45 }, idio: 0.4 },
  { id: "EFA", ticker: "EFA", name: "Developed ex-US", group: "INTL", load: { EQ: 0.85, USD: -0.4 }, idio: 0.3 },
  { id: "IBIT", ticker: "IBIT", name: "Bitcoin", group: "CRYPTO", load: { EQ: 0.35, GRW: 0.3, CRY: 1 }, idio: 0.4 },
];

export const NODES: NexusNode[] = ASSETS.map(({ id, ticker, name, group }) => ({ id, ticker, name, group }));

/** Deterministic noise in [-1, 1] from a string */
function noise(key: string): number {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/** Shorter windows = regime noise on the loadings (±12% at 30D, ±6% at 90D). */
const JITTER: Record<Window, number> = { "30D": 0.12, "90D": 0.06, "1Y": 0 };

const cache = new Map<Window, NexusLink[]>();

/** Every pair once (i < j), coefficient rounded to 2 decimals. */
export function correlations(win: Window): NexusLink[] {
  const hit = cache.get(win);
  if (hit) return hit;
  const vec = ASSETS.map((a) => FACTORS.map((f) => (a.load[f] ?? 0) * (1 + JITTER[win] * noise(`${win}:${a.id}:${f}`))));
  const varOf = (i: number) => vec[i].reduce((s, v) => s + v * v, 0) + ASSETS[i].idio ** 2;
  const out: NexusLink[] = [];
  for (let i = 0; i < ASSETS.length; i++)
    for (let j = i + 1; j < ASSETS.length; j++) {
      const cov = vec[i].reduce((s, v, k) => s + v * vec[j][k], 0);
      out.push({ source: ASSETS[i].id, target: ASSETS[j].id, correlation_value: Math.round((cov / Math.sqrt(varOf(i) * varOf(j))) * 100) / 100 });
    }
  cache.set(win, out);
  return out;
}

/** ρ lookup for a pair, any order */
export function rho(links: NexusLink[], a: string, b: string): number {
  const l = links.find((x) => (x.source === a && x.target === b) || (x.source === b && x.target === a));
  return l?.correlation_value ?? 0;
}
