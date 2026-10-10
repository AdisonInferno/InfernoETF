/* Sector tagging for archived news.
 *
 *   company news  → sub-sectors of the companies it is about (from the ETF holdings data)
 *   sector news   → no tracked company, but the text clearly belongs to an industry (keywords)
 *   macro news    → rates, inflation, central banks, broad market — relevant to every ETF
 *
 * Sub-sector names are the same ones lib/fund-profiles.ts uses (SUB_PARENT keys), so an article's
 * sectors can be matched directly against an ETF's sector split. */

import { PROFILE_OF, SUB_PARENT } from "@/lib/fund-profiles";

export type NewsKind = "company" | "sector" | "macro" | "other";

/** ticker → sub-sector, from every ETF profile's holdings */
export const TICKER_SUB: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const prof of new Set(Object.values(PROFILE_OF))) {
    for (const line of prof.holdings) {
      const [t, , , sub] = line.split("|");
      if (sub && !out[t]) out[t] = sub;
    }
  }
  out.GOOG ??= out.GOOGL;
  return out;
})();

/** Industry keyword rules → sub-sector. Word-boundary, case-insensitive. Tune freely. */
const RULES: [sub: string, re: RegExp][] = [
  ["Semiconductors", /\b(semiconductors?|chipmakers?|chips?|foundr(y|ies)|wafers?|gpus?|ai accelerators?|hbm|memory chips?)\b/i],
  ["Semi Equipment", /\b(lithography|euv|(chip|chipmaking|semiconductor) ?(equipment|tools?)|wafer fab equipment|wfe|equipment (vendors|makers|stocks))\b/i],
  ["Software", /\b(software|saas|cloud computing|enterprise ai|copilot)\b/i],
  ["Cybersecurity", /\b(cyber ?security|cyber ?attacks?|ransomware|data breach|hackers?)\b/i],
  ["Aerospace & Defense", /\b(defen[cs]e (spending|budget|contracts?|stocks?|industry)|pentagon|nato|military|munitions?|missiles?|fighter jets?|air defen[cs]e|weapons?|arms (deal|sales|exports?)|drones? (makers?|contracts?))\b/i],
  ["Space", /\b(satellites?|launch vehicles?|rocket launch|space ?(industry|economy|force|station)|orbit(al)?)\b/i],
  ["Oil & Gas", /\b(oil prices?|crude|brent|wti|opec\+?|natural gas|lng|oil (output|supply|demand))\b/i],
  ["Refining", /\b(refiner(y|ies)|crack spreads?|gasoline prices?)\b/i],
  ["Uranium", /\b(uranium|nuclear (power|reactors?|energy|fuel)|smr|small modular reactors?)\b/i],
  ["Solar & Wind", /\b(solar|wind (power|farms?|turbines?)|renewables?|clean energy)\b/i],
  ["Banks", /\b(banks?|banking|lenders?|net interest income|deposits?)\b/i],
  ["Insurance", /\b(insurers?|insurance|reinsurance|underwriting)\b/i],
  ["Payments", /\b(payments?|card networks?|digital wallets?)\b/i],
  ["Digital Assets", /\b(bitcoin|crypto(currency|currencies)?|ether(eum)?|stablecoins?|spot (bitcoin|ether) etf)\b/i],
  ["Precious Metals", /\b(gold prices?|gold|silver prices?|precious metals?|bullion)\b/i],
  ["Metals & Mining", /\b(copper|lithium|mining|miners?|iron ore|rare earths?)\b/i],
  ["Pharma", /\b(pharma(ceutical)?s?|drugmakers?|fda (approval|approves)|glp-1|obesity drugs?)\b/i],
  ["Biotech", /\b(biotech|clinical trials?|phase (1|2|3|i|ii|iii))\b/i],
  ["Automobiles", /\b(automakers?|car ?makers?|electric vehicles?|\bev sales|vehicle sales)\b/i],
  ["E-Commerce", /\b(e-?commerce|online retail)\b/i],
  ["Electric Utilities", /\b(utilit(y|ies)|power grid|electricity (prices?|demand))\b/i],
  ["Real Estate", /\b(reits?|real estate|housing market|home sales|mortgage rates?)\b/i],
  ["Robotics", /\b(robotics?|humanoid robots?|industrial automation)\b/i],
  ["Quantum", /\b(quantum (computing|computers?|chips?))\b/i],
];

const MACRO = /\b(fed|federal reserve|fomc|ecb|central bank|interest rates?|rate (cut|hike)s?|inflation|cpi|ppi|jobs report|payrolls|unemployment|gdp|recession|treasur(y|ies) yields?|bond yields?|tariffs?|s&p 500|nasdaq|dow jones|stock market|wall street)\b/i;

export function classify(text: string, relevant: string[]): { kind: NewsKind; subs: string[] } {
  const subs = new Set<string>();
  for (const t of relevant) if (TICKER_SUB[t]) subs.add(TICKER_SUB[t]);
  for (const [sub, re] of RULES) if (re.test(text)) subs.add(sub);
  const kind: NewsKind = relevant.length ? "company" : subs.size ? "sector" : MACRO.test(text) ? "macro" : "other";
  return { kind, subs: [...subs] };
}

export const parentOf = (sub: string) => SUB_PARENT[sub] ?? "Other";
