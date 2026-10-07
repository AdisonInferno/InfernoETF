export type Tf = "1D" | "1W" | "1M" | "YTD" | "1Y" | "5Y";
export type SubTab = "OV" | "MAP" | "SEAS" | "DIV" | "BT";

export interface Holding { tic: string; name: string; w: number }            // w = weight in fund, %
export interface HoldingMeta { sector: string; capB: number }                // capB = market cap, USD bn
export interface TfDef { points: number; changePct: number; vol: number; axis: string[] }
export interface Alt { tic: string; name: string; ter: number }              // cheaper alternative, ter in %
export type RiskTile = [label: string, value: string, negative?: boolean];

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
