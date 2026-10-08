export type Tf = "1D" | "1W" | "2W" | "1M" | "3M" | "YTD" | "1Y" | "3Y" | "5Y";
export type SubTab = "OV" | "MAP" | "SEAS";

export interface Holding { tic: string; name: string; w: number }            // w = weight in fund, %
export interface HoldingMeta { sector: string; capB: number }                // capB = market cap, USD bn
export interface TfDef { points: number; changePct: number; vol: number; axis: string[] }
export interface Alt { tic: string; name: string; ter: number }              // cheaper alternative, ter in %
export type RiskTile = [label: string, value: string, negative?: boolean];

/** Numbers shown in the Chart Overview metrics grid. */
export interface FundStats {
  aumB: number;        // USD bn
  ter: number;         // %
  divYield: number;    // %
  navPrem: number;     // premium (+) / discount (-) to NAV, %
  beta: number;        // vs S&P 500
  vol30d: number;      // annualised 30-day volatility, %
  sharpe: number;
  maxDD: number;       // %, negative
}

export interface FundData {
  tic: string;
  name: string;
  category: string;                    // e.g. "TECH / SEMIS"
  price: number;
  dayPct: number;
  aumB: number;
  ter: number;                         // % — used for "savings vs" tooltip
  meta: [label: string, value: string][];
  holdings: Holding[];                 // sorted desc by weight
  holdingMeta: Record<string, HoldingMeta>;
  geo: [region: string, pct: number][];
  sectors: [subSector: string, pct: number][];
  sectorParent: Record<string, string>; // sub-sector -> parent sector
  risk: RiskTile[];
  stats: FundStats;
  alts: Alt[];
  seasonality: [year: number, monthly: (number | null)[]][];
  /** % change per chart timeframe */
  perf: Record<Tf, number>;
  /** Price-series volatility multiplier (1 = broad index) */
  volMul: number;
  /** [NAV $, premium/discount %] */
  nav: [number, number];
  /** Text shown (blurred) in the AI Oversight card */
  aiNote: string;
  /** Total positions in the real fund */
  positions: number;
}
