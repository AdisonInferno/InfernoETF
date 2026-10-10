/* Mock news feed. Swap `fetchSectorNews` for a real provider later — keep the NewsArticle shape
   and everything downstream (prompt, UI "Sources used") keeps working. */

export type Sector = "tech" | "energy" | "financials" | "defense";

export const SECTORS: { id: Sector; label: string }[] = [
  { id: "tech", label: "Tech" },
  { id: "energy", label: "Energy" },
  { id: "financials", label: "Financials" },
  { id: "defense", label: "Defense" },
];

export interface NewsArticle {
  id: string;        // stable id, e.g. "S1" — used to cite sources
  title: string;
  source: string;
  date: string;      // ISO date
  snippet: string;
}

const FEED: Record<Sector, Omit<NewsArticle, "id">[]> = {
  tech: [
    { title: "Chipmakers rally as hyperscalers lift 2027 AI capex guidance", source: "Market Wire", date: "2026-10-09", snippet: "Three of the largest cloud providers raised next-year data-center spending plans by a combined 18%, citing sustained demand for AI training and inference capacity." },
    { title: "Semiconductor export rules tightened for advanced packaging equipment", source: "Policy Desk", date: "2026-10-08", snippet: "New licensing requirements cover advanced packaging tools; analysts estimate a low-single-digit revenue impact for affected equipment vendors over the next four quarters." },
    { title: "Software earnings preview: seat growth slows, AI add-ons cushion margins", source: "Equity Notes", date: "2026-10-07", snippet: "Consensus expects enterprise seat growth to decelerate to 6% y/y, while paid AI add-on attach rates are forecast to offset most of the margin pressure." },
  ],
  energy: [
    { title: "Brent slips as OPEC+ signals gradual output increase from December", source: "Commodity Daily", date: "2026-10-09", snippet: "The group plans to restore 180k bpd per month; traders priced in a modest supply surplus for Q1 2027." },
    { title: "US refiners post record throughput ahead of winter", source: "Energy Ledger", date: "2026-10-08", snippet: "Utilisation reached 94.1%, the highest seasonal level in a decade, compressing crack spreads from summer peaks." },
    { title: "Utility-scale solar installations beat forecasts in Q3", source: "Grid Report", date: "2026-10-06", snippet: "Installations rose 22% q/q as module prices stayed near multi-year lows, supporting developer margins." },
  ],
  financials: [
    { title: "Large banks guide net interest income flat as rate cuts filter through", source: "Bank Brief", date: "2026-10-09", snippet: "Management teams expect deposit repricing to offset lower asset yields, holding NII roughly unchanged into 2027." },
    { title: "Investment banking fees rebound on IPO and M&A pipeline", source: "Deal Flow", date: "2026-10-08", snippet: "Advisory backlogs are up 27% y/y with several large technology listings scheduled for November." },
    { title: "Credit card delinquencies tick higher for second straight quarter", source: "Consumer Credit Watch", date: "2026-10-07", snippet: "30-day delinquencies rose 12bp q/q, though remain below pre-2020 averages; reserve builds are expected to be modest." },
  ],
  defense: [
    { title: "NATO members announce additional procurement commitments", source: "Security Wire", date: "2026-10-09", snippet: "Eight member states outlined multi-year munitions and air-defence orders, extending prime contractor backlogs into 2030." },
    { title: "Satellite constellation contract awarded for secure communications", source: "Space & Defense", date: "2026-10-08", snippet: "The multi-year award covers 120 low-earth-orbit satellites, with first launches scheduled for late 2027." },
    { title: "Defense budget negotiations stall over continuing resolution", source: "Capitol Report", date: "2026-10-06", snippet: "A short-term funding extension would delay new program starts, though existing contracts continue at current levels." },
  ],
};

/** Simulated network fetch of the 3 most recent articles for a sector. */
export async function fetchSectorNews(sector: Sector): Promise<NewsArticle[]> {
  await new Promise((r) => setTimeout(r, 150));
  return FEED[sector].map((a, i) => ({ id: `S${i + 1}`, ...a }));
}

export function isSector(v: unknown): v is Sector {
  return typeof v === "string" && v in FEED;
}
