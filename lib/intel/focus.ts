/* The sectors Market Intel focuses on. Add a sector here and it appears everywhere:
   sentiment tile, sector switch, SEC filer list, commodity tagging. */

import type { Region } from "./sentiment";

export type SectorId = "tech" | "defense";

export interface FocusSector {
  id: SectorId;
  label: string;
  /** Archive sub-sectors (lib/fund-profiles names) that make up the sector */
  subs: string[];
  /** SEC filers we follow, per region (EU/Asia = US-listed ADRs that file with the SEC) */
  filers: Record<Region, string[]>;
  /** What the sector depends on — given to Gemini when tagging commodity news */
  inputs: string;
}

export const FOCUS: FocusSector[] = [
  {
    id: "tech",
    label: "Technology",
    subs: ["Software", "IT Hardware", "IT Services", "Consumer Electronics", "EDA Software", "Interactive Media", "Quantum", "Semiconductors", "Semi Equipment", "Semi Materials", "Cybersecurity"],
    filers: {
      us: ["NVDA", "MSFT", "AAPL", "AVGO", "AMD", "GOOGL", "META", "ORCL", "PLTR", "CRM", "MU", "AMAT", "LRCX", "CRWD", "PANW"],
      eu: ["ASML", "SAP", "ARM", "SPOT", "NOK", "ERIC"],
      asia: ["TSM", "BABA", "PDD", "NTES", "BIDU", "INFY", "SONY", "JD"],
    },
    inputs: "chips & foundries (TSMC), rare earths, gallium, germanium, neon, helium, copper, silicon, electricity for data centers",
  },
  {
    id: "defense",
    label: "Defense & Space",
    subs: ["Aerospace & Defense", "Space"],
    filers: {
      us: ["LMT", "RTX", "NOC", "GD", "LHX", "BA", "HII", "TDG", "KTOS", "HWM", "RKLB", "AVAV", "LDOS", "BWXT"],
      eu: ["ESLT"],
      asia: [],
    },
    inputs: "titanium, aluminium, steel, rare earths (magnets), nickel, cobalt, explosives & energetics, jet fuel, semiconductors for guidance systems",
  },
];

export const focusById = (id: string) => FOCUS.find((s) => s.id === id) ?? FOCUS[0];
export const SECTOR_OF_TICKER: Record<string, SectorId> = Object.fromEntries(
  FOCUS.flatMap((s) => Object.values(s.filers).flat().map((t) => [t, s.id]))
);
