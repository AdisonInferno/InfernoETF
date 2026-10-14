/* Cross-asset correlation data for the Macro Nexus (ETF Tools → Correlation Map).
 *
 * MOCK DATA — illustrative, not live market data. Correlations come from a small factor model:
 * every asset loads on a few macro factors + its own idiosyncratic noise, so the matrix is always
 * internally consistent. The loadings encode the intended economics, e.g.
 *   · semiconductors are more cyclical than mega-cap "old" tech → more linked to oil / copper,
 *   · defense-tech is more exposed to geopolitical shocks than the mature primes (ITA/PPA) → more
 *     linked to oil, and more rate-sensitive (growth-style valuations).
 * Swap `correlations()` for real return correlations later and keep the same shapes. */

export type Window = "30D" | "90D" | "1Y";
export const WINDOWS: Window[] = ["30D", "90D", "1Y"];

/** Asset type — drives node colour */
export type AssetClass = "INDEX" | "SECTOR" | "COMMODITY" | "FX" | "BONDS" | "CRYPTO";
export const CLASS_META: Record<AssetClass, { label: string; color: string }> = {
  INDEX: { label: "INDICES", color: "#a78bfa" }, // violet
  SECTOR: { label: "SECTOR ETFs", color: "#2dd4bf" }, // teal
  COMMODITY: { label: "COMMODITIES", color: "#fbbf24" }, // amber
  FX: { label: "CURRENCIES", color: "#60a5fa" }, // blue
  BONDS: { label: "BONDS & CREDIT", color: "#a3e635" }, // lime
  CRYPTO: { label: "CRYPTO", color: "#f472b6" }, // pink
};

export type View = "ALL" | "TECH" | "DEFENSE";
export const VIEWS: { id: View; label: string; hint: string }[] = [
  { id: "ALL", label: "ALL MARKETS", hint: "Indices, sectors, commodities, currencies, bonds" },
  { id: "TECH", label: "TECHNOLOGY", hint: "Tech ETF constellation vs. macro anchors" },
  { id: "DEFENSE", label: "DEFENSE", hint: "Defense ETF constellation vs. macro anchors" },
];

export interface NexusNode {
  id: string;
  ticker: string;
  /** Short display name, shown on the map */
  name: string;
  /** One-line description for the side panel */
  desc: string;
  cls: AssetClass;
  /** Focus-sector constellation(s) this asset belongs to */
  sector?: "TECH" | "DEFENSE";
  /** Shown in the ALL view */
  core?: boolean;
}
export interface NexusLink { source: string; target: string; correlation_value: number }

/* Factors: EQ broad equity · GRW growth/long-duration equity · CYC cyclical · RATE bond rally (= falling yields) ·
   INFL commodity/inflation · GOLD precious · USD dollar · DEF defense budgets · GEO geopolitical risk · CRY crypto */
type F = "EQ" | "GRW" | "CYC" | "RATE" | "INFL" | "GOLD" | "USD" | "DEF" | "GEO" | "CRY";
const FACTORS: F[] = ["EQ", "GRW", "CYC", "RATE", "INFL", "GOLD", "USD", "DEF", "GEO", "CRY"];

type A = NexusNode & { load: Partial<Record<F, number>>; idio: number };
const ASSETS: A[] = [
  /* Indices */
  { id: "SPY", ticker: "SPY", name: "S&P 500", desc: "US large caps", cls: "INDEX", core: true, load: { EQ: 1, GRW: 0.3, CYC: 0.2, GEO: -0.1 }, idio: 0.12 },
  { id: "QQQ", ticker: "QQQ", name: "NASDAQ 100", desc: "US growth / mega-cap tech", cls: "INDEX", core: true, load: { EQ: 0.95, GRW: 0.7, RATE: 0.15 }, idio: 0.18 },
  { id: "IWM", ticker: "IWM", name: "RUSSELL 2000", desc: "US small caps", cls: "INDEX", core: true, load: { EQ: 0.95, CYC: 0.5, RATE: 0.1 }, idio: 0.35 },
  { id: "EFA", ticker: "EFA", name: "DEVELOPED EX-US", desc: "Europe, Japan, Australia", cls: "INDEX", core: true, load: { EQ: 0.85, USD: -0.4 }, idio: 0.3 },
  { id: "EEM", ticker: "EEM", name: "EMERGING MKTS", desc: "China, Taiwan, India, Brazil…", cls: "INDEX", core: true, load: { EQ: 0.8, CYC: 0.3, USD: -0.45 }, idio: 0.4 },

  /* Technology constellation */
  { id: "XLK", ticker: "XLK", name: "TECH MEGA-CAP", desc: "Technology Select SPDR — Apple, Microsoft, Nvidia (mature, cash-rich)", cls: "SECTOR", sector: "TECH", core: true, load: { EQ: 0.9, GRW: 0.55, RATE: 0.1 }, idio: 0.22 },
  { id: "VGT", ticker: "VGT", name: "INFO TECH BROAD", desc: "Vanguard Information Technology — all US tech", cls: "SECTOR", sector: "TECH", load: { EQ: 0.9, GRW: 0.65, CYC: 0.1, RATE: 0.12 }, idio: 0.22 },
  { id: "SMH", ticker: "SMH", name: "SEMICONDUCTORS", desc: "VanEck Semiconductor — cyclical, capex & commodity sensitive", cls: "SECTOR", sector: "TECH", core: true, load: { EQ: 0.9, GRW: 0.8, CYC: 0.45, INFL: 0.25 }, idio: 0.4 },
  { id: "SOXX", ticker: "SOXX", name: "SEMIS (ISHARES)", desc: "iShares Semiconductor — equal-ish weight chipmakers", cls: "SECTOR", sector: "TECH", load: { EQ: 0.9, GRW: 0.78, CYC: 0.5, INFL: 0.28 }, idio: 0.42 },
  { id: "IGV", ticker: "IGV", name: "SOFTWARE", desc: "iShares Expanded Tech-Software — long-duration growth", cls: "SECTOR", sector: "TECH", load: { EQ: 0.8, GRW: 0.75, RATE: 0.3 }, idio: 0.4 },
  { id: "SKYY", ticker: "SKYY", name: "CLOUD", desc: "First Trust Cloud Computing", cls: "SECTOR", sector: "TECH", load: { EQ: 0.8, GRW: 0.8, RATE: 0.35 }, idio: 0.45 },
  { id: "BOTZ", ticker: "BOTZ", name: "ROBOTICS & AI", desc: "Global X Robotics & AI — industrial automation", cls: "SECTOR", sector: "TECH", load: { EQ: 0.8, GRW: 0.6, CYC: 0.35, INFL: 0.15 }, idio: 0.45 },
  { id: "ARKK", ticker: "ARKK", name: "DISRUPTIVE INNOV.", desc: "ARK Innovation — speculative growth, very rate-sensitive", cls: "SECTOR", sector: "TECH", load: { EQ: 0.75, GRW: 0.9, RATE: 0.45, CRY: 0.3 }, idio: 0.6 },

  /* Defense constellation */
  { id: "ITA", ticker: "ITA", name: "DEFENSE PRIMES", desc: "iShares US Aerospace & Defense — mature primes (RTX, LMT, GD)", cls: "SECTOR", sector: "DEFENSE", core: true, load: { EQ: 0.6, CYC: 0.15, DEF: 0.75, GEO: 0.2 }, idio: 0.3 },
  { id: "PPA", ticker: "PPA", name: "AERO & DEFENSE", desc: "Invesco Aerospace & Defense — broad, prime-heavy", cls: "SECTOR", sector: "DEFENSE", load: { EQ: 0.62, DEF: 0.72, GEO: 0.25 }, idio: 0.32 },
  { id: "XAR", ticker: "XAR", name: "DEFENSE EQ-WEIGHT", desc: "SPDR S&P Aerospace & Defense — equal weight, more mid caps", cls: "SECTOR", sector: "DEFENSE", core: true, load: { EQ: 0.65, GRW: 0.2, CYC: 0.2, DEF: 0.65, GEO: 0.3 }, idio: 0.42 },
  { id: "SHLD", ticker: "SHLD", name: "DEFENSE TECH", desc: "Global X Defense Tech — drones, cyber, AI; geopolitics & rate sensitive", cls: "SECTOR", sector: "DEFENSE", load: { EQ: 0.55, GRW: 0.35, RATE: 0.2, INFL: 0.2, DEF: 0.6, GEO: 0.55 }, idio: 0.45 },
  { id: "UFO", ticker: "UFO", name: "SPACE", desc: "Procure Space — satellites, launch", cls: "SECTOR", sector: "DEFENSE", load: { EQ: 0.7, GRW: 0.45, CYC: 0.25, DEF: 0.3, GEO: 0.1 }, idio: 0.55 },

  /* Other sectors (ALL view) */
  { id: "XLF", ticker: "XLF", name: "FINANCIALS", desc: "Banks, insurers", cls: "SECTOR", core: true, load: { EQ: 0.85, CYC: 0.6, RATE: -0.25 }, idio: 0.35 },
  { id: "XLE", ticker: "XLE", name: "ENERGY STOCKS", desc: "Oil & gas producers", cls: "SECTOR", core: true, load: { EQ: 0.5, CYC: 0.4, INFL: 0.8, GEO: 0.3 }, idio: 0.4 },
  { id: "XLB", ticker: "XLB", name: "MATERIALS", desc: "Chemicals, miners", cls: "SECTOR", core: true, load: { EQ: 0.75, CYC: 0.4, INFL: 0.35 }, idio: 0.4 },
  { id: "XLU", ticker: "XLU", name: "UTILITIES", desc: "Regulated power & gas", cls: "SECTOR", core: true, load: { EQ: 0.45, RATE: 0.5 }, idio: 0.45 },
  { id: "VNQ", ticker: "VNQ", name: "REAL ESTATE", desc: "US REITs", cls: "SECTOR", core: true, load: { EQ: 0.7, RATE: 0.5 }, idio: 0.4 },
  { id: "GDX", ticker: "GDX", name: "GOLD MINERS", desc: "Gold mining stocks", cls: "SECTOR", core: true, load: { GOLD: 0.9, EQ: 0.35 }, idio: 0.55 },

  /* Commodities */
  { id: "USO", ticker: "USO", name: "CRUDE OIL", desc: "WTI crude futures", cls: "COMMODITY", core: true, load: { EQ: 0.2, INFL: 1, GEO: 0.45 }, idio: 0.5 },
  { id: "CPER", ticker: "CPER", name: "COPPER", desc: "Copper futures — the cyclical metal", cls: "COMMODITY", core: true, load: { EQ: 0.35, CYC: 0.5, INFL: 0.55 }, idio: 0.5 },
  { id: "GLD", ticker: "GLD", name: "GOLD", desc: "Gold bullion", cls: "COMMODITY", core: true, load: { GOLD: 1, USD: -0.35, RATE: 0.2, GEO: 0.2 }, idio: 0.25 },
  { id: "SLV", ticker: "SLV", name: "SILVER", desc: "Silver bullion — half precious, half industrial", cls: "COMMODITY", core: true, load: { GOLD: 0.85, INFL: 0.3, CYC: 0.2, EQ: 0.2 }, idio: 0.5 },

  /* Currencies */
  { id: "UUP", ticker: "UUP", name: "US DOLLAR", desc: "Dollar index vs. basket", cls: "FX", core: true, load: { USD: 1, EQ: -0.25 }, idio: 0.3 },
  { id: "FXE", ticker: "FXE", name: "EURO", desc: "EUR/USD", cls: "FX", core: true, load: { USD: -0.95, EQ: 0.1 }, idio: 0.35 },

  /* Bonds & credit */
  { id: "TLT", ticker: "TLT", name: "US 20Y+ BONDS", desc: "Long Treasuries — rises when yields fall", cls: "BONDS", core: true, load: { RATE: 1, EQ: -0.25 }, idio: 0.15 },
  { id: "IEF", ticker: "IEF", name: "US 7–10Y BONDS", desc: "Intermediate Treasuries", cls: "BONDS", core: true, load: { RATE: 0.9, EQ: -0.15 }, idio: 0.12 },
  { id: "HYG", ticker: "HYG", name: "HIGH YIELD", desc: "Junk bonds — trade like equities", cls: "BONDS", core: true, load: { EQ: 0.55, CYC: 0.2, RATE: 0.35 }, idio: 0.35 },

  /* Crypto */
  { id: "IBIT", ticker: "IBIT", name: "BITCOIN", desc: "Spot bitcoin", cls: "CRYPTO", core: true, load: { EQ: 0.35, GRW: 0.3, CRY: 1 }, idio: 0.4 },
];

export const ALL_NODES: NexusNode[] = ASSETS.map(({ id, ticker, name, desc, cls, sector, core }) => ({ id, ticker, name, desc, cls, sector, core }));

/** Macro anchors shown next to each sector constellation */
export const ANCHORS = ["SPY", "USO", "CPER", "GLD", "UUP", "TLT"];
export const ANCHOR_LABEL: Record<string, string> = { SPY: "S&P", USO: "OIL", CPER: "COPPER", GLD: "GOLD", UUP: "USD", TLT: "BONDS" };

export function nodesFor(view: View): NexusNode[] {
  if (view === "ALL") return ALL_NODES.filter((n) => n.core);
  return ALL_NODES.filter((n) => n.sector === view || ANCHORS.includes(n.id));
}

/** Deterministic noise in [-1, 1] from a string */
function noise(key: string): number {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/** Shorter windows = regime noise on the loadings (±12% at 30D, ±6% at 90D). */
const JITTER: Record<Window, number> = { "30D": 0.12, "90D": 0.06, "1Y": 0 };
const cache = new Map<Window, NexusLink[]>();

/** Every pair once (i < j) across all assets, coefficient rounded to 2 decimals. */
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
