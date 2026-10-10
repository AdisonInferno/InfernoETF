/* Server-only: sector sentiment index (−100 … +100) per region, from the news archive.
 *
 * Scoring is a transparent finance lexicon (no AI cost): each high-quality article scores
 * (positive − negative words) / (positive + negative), in [−1, 1]. A sector's index is the
 * average score, shrunk toward 0 when there are few articles, × 100.
 * The card also shows the article that pushed the index hardest — the "why". */

import { queryArchive } from "@/lib/news-archive/store";
import type { CleanArticle } from "@/lib/news-archive/quality";

export type Region = "us" | "eu" | "asia";

/** Display groups → archive sub-sectors */
export const GROUPS: { id: string; label: string; subs: string[] }[] = [
  { id: "tech", label: "Technology", subs: ["Software", "IT Hardware", "IT Services", "Consumer Electronics", "EDA Software", "Interactive Media", "Quantum"] },
  { id: "semis", label: "Semiconductors", subs: ["Semiconductors", "Semi Equipment", "Semi Materials"] },
  { id: "defense", label: "Defense & Space", subs: ["Aerospace & Defense", "Space"] },
  { id: "cyber", label: "Cybersecurity", subs: ["Cybersecurity"] },
  { id: "fin", label: "Financials", subs: ["Banks", "Regional Banks", "Insurance", "Payments", "Capital Markets", "Asset Management", "Fintech"] },
  { id: "energy", label: "Oil & Gas", subs: ["Oil & Gas", "Oil & Gas E&P", "Refining", "Midstream", "Oilfield Services"] },
  { id: "nuclear", label: "Nuclear & Uranium", subs: ["Uranium", "Independent Power"] },
  { id: "clean", label: "Clean Energy & Utilities", subs: ["Solar & Wind", "Electric Utilities", "Multi-Utilities", "Renewable Utilities"] },
  { id: "health", label: "Health Care", subs: ["Pharma", "Biotech", "Managed Care", "Medical Devices", "Life Sciences Tools"] },
  { id: "consumer", label: "Consumer", subs: ["E-Commerce", "Automobiles", "Retail", "Restaurants", "Travel & Leisure", "Apparel", "Specialty Retail", "Household", "Beverages", "Food Products"] },
  { id: "industrial", label: "Industrials", subs: ["Machinery", "Electrical Equipment", "Transportation", "Industrial Services", "Engineering & Construction", "Robotics"] },
  { id: "materials", label: "Metals & Mining", subs: ["Metals & Mining", "Copper Mining", "Precious Metals", "Steel", "Chemicals"] },
  { id: "crypto", label: "Crypto", subs: ["Digital Assets"] },
];
const GROUP_OF: Record<string, string> = Object.fromEntries(GROUPS.flatMap((g) => g.subs.map((s) => [s, g.id])));

/* ── Region ── */
const EU_TICKERS = new Set(["ASML", "SHEL", "AZN", "TTE", "SAP", "NVO", "UL", "BP", "HSBC", "DEO", "GSK", "RIO", "BHP", "SNY", "BCS", "ING", "SAN", "STLA", "ERIC", "NOK", "ABBNY", "RACE", "ARM", "SPOT", "ADYEY", "EDPR", "RHM", "BAESY", "SAAB"]);
const ASIA_TICKERS = new Set(["TSM", "BABA", "PDD", "NTES", "TCOM", "TCEHY", "INFY", "IBN", "HDB", "JD", "BIDU", "SONY", "TM", "HMC", "MUFG", "SMFG", "NIO", "LI", "XPEV", "BEKE", "YUMC", "CBA", "WIT", "SE", "GRAB", "CPNG"]);
const EU_WORDS = /\b(europe(an)?|eu|euro ?zone|ecb|lagarde|germany|german|france|french|britain|british|uk|london|italy|spain|netherlands|dutch|swiss|switzerland|nordic|sweden|norway|poland|polish|brussels|stoxx|dax|ftse|cac)\b/i;
const ASIA_WORDS = /\b(asia(n)?|china|chinese|beijing|shanghai|hong kong|japan(ese)?|tokyo|boj|nikkei|korea(n)?|seoul|kospi|taiwan(ese)?|india(n)?|mumbai|sensex|nifty|singapore|indonesia|vietnam|australia(n)?|asx)\b/i;

function regionsOf(a: CleanArticle): Set<Region> {
  const r = new Set<Region>();
  const text = `${a.headline} ${a.summary}`;
  for (const t of a.relevant) { if (EU_TICKERS.has(t)) r.add("eu"); else if (ASIA_TICKERS.has(t)) r.add("asia"); else r.add("us"); }
  if (EU_WORDS.test(text)) r.add("eu");
  if (ASIA_WORDS.test(text)) r.add("asia");
  if (!r.size) r.add("us"); // archive sources are US-centric
  return r;
}

/* ── Lexicon ── */
const POS = /\b(beats?|beat estimates|tops?|raises?d?|raising|upgrades?d?|record|surges?d?|soars?|jumps?e?d?|rall(y|ies|ied)|gains?e?d?|wins?|won|awarded|contracts? worth|approv(al|ed|es)|strong(er)?|growth|expands?|boosts?|accelerat(es|ing)|outperform|bullish|higher|rebounds?|recover(y|s)|demand (surge|boom)|orders? (rise|jump)|profit (rises|jumps)|buyback|dividend (hike|increase))\b/gi;
const NEG = /\b(miss(es|ed)?|cuts?|cutting|downgrades?d?|plunges?d?|slumps?|tumbles?d?|falls?|fell|drops?|dropped|sinks?|slides?|lawsuits?|probe|investigation|recalls?|layoffs?|job cuts|weak(er|ness)?|warns?|warning|delays?e?d?|bans?|sanctions?|tariffs?|fines?d?|losses|loss|bearish|lower|shortfall|halts?|bankrupt(cy)?|default|downturn|slowdown|underperform|selloff|sell-off)\b/gi;

function score(a: CleanArticle): number {
  const text = `${a.headline} ${a.headline} ${a.summary}`; // headline counts double
  const p = text.match(POS)?.length ?? 0, n = text.match(NEG)?.length ?? 0;
  return p + n ? (p - n) / (p + n) : 0;
}

export interface SectorSentiment {
  id: string; label: string;
  index: number;            // −100 … +100
  articles: number;
  driver: { headline: string; url: string; source: string } | null;
}

export async function sectorSentiment(region: Region, days = 7): Promise<{ sectors: SectorSentiment[]; articles: number }> {
  const from = Math.floor(Date.now() / 1000) - days * 86400;
  const all = (await queryArchive({ from, limit: 1000 })).filter((a) => a.kind !== "macro" && regionsOf(a).has(region));
  const acc: Record<string, { sum: number; n: number; best: CleanArticle | null; bestAbs: number; scores: number[] }> = {};
  for (const a of all) {
    const s = score(a);
    const groups = new Set(a.subs.map((sub) => GROUP_OF[sub]).filter(Boolean));
    for (const gId of groups) {
      const x = (acc[gId] ??= { sum: 0, n: 0, best: null, bestAbs: 0, scores: [] });
      x.sum += s; x.n++;
      x.scores.push(s);
      // remember the most decisive article in the direction of the running average
      if (Math.abs(s) > x.bestAbs || (Math.abs(s) === x.bestAbs && x.best && a.ts > x.best.ts)) { x.best = a; x.bestAbs = Math.abs(s); }
    }
  }
  const sectors = GROUPS.filter((g) => acc[g.id]?.n).map((g) => {
    const x = acc[g.id];
    const idx = Math.round((100 * x.sum) / (x.n + 3)); // shrink: 1 article can't swing to ±100
    const dir = Math.sign(idx);
    const pool = all.filter((a) => a.subs.some((s) => GROUP_OF[s] === g.id));
    const driver = pool.filter((a) => Math.sign(score(a)) === dir && dir !== 0).sort((p, q) => Math.abs(score(q)) - Math.abs(score(p)) || q.ts - p.ts)[0] ?? x.best;
    return { id: g.id, label: g.label, index: Math.max(-100, Math.min(100, idx)), articles: x.n, driver: driver ? { headline: driver.headline, url: driver.url, source: driver.source } : null };
  });
  // Most-covered sectors first
  return { sectors: sectors.sort((a, b) => b.articles - a.articles), articles: all.length };
}
