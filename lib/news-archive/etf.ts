/* Server-only: news for one ETF, built from company + sector news.
 *
 *   company  articles about the ETF's own holdings, scored by holding weight (%)
 *   sector   industry articles (or news about peers the ETF doesn't hold) in sub-sectors the ETF
 *            is exposed to, scored by that exposure (%)
 *   macro    rates / inflation / broad market — shown separately, same for every ETF
 *
 * Only quality="high" articles are used. */

import { buildFund } from "@/components/deep-view/buildFund";
import { queryArchive } from "./store";
import { parentOf } from "./sectors";
import type { CleanArticle } from "./quality";

export interface EtfNewsItem {
  id: string; ts: number; headline: string; summary: string; source: string; url: string; provider: string;
  kind: CleanArticle["kind"];
  /** Holdings of this ETF the article is about, with their weight in the ETF */
  holdings: { tic: string; w: number }[];
  /** Sub-sectors that tie the article to this ETF, with the ETF's exposure */
  sectors: { sub: string; pct: number }[];
  /** Ranking score: % of the ETF the article concerns */
  score: number;
}

export interface EtfNews {
  tic: string; name: string; days: number;
  company: EtfNewsItem[];
  sector: EtfNewsItem[];
  macro: EtfNewsItem[];
  /** % of ETF weight whose holdings had at least one company article in the window */
  coverage: number;
  topSectors: { sub: string; pct: number; articles: number }[];
}

const strip = (a: CleanArticle) => ({ id: a.id, ts: a.ts, headline: a.headline, summary: a.summary, source: a.source, url: a.url, provider: a.provider, kind: a.kind });

export async function etfNews(ticker: string, days = 30, limit = 40): Promise<EtfNews | null> {
  const fund = buildFund(ticker);
  if (!fund) return null;

  const weight: Record<string, number> = {};
  for (const h of fund.holdings) { const t = h.tic === "GOOG" ? "GOOGL" : h.tic; weight[t] = (weight[t] ?? 0) + h.w; }
  const subPct: Record<string, number> = Object.fromEntries(fund.sectors);
  const parentPct: Record<string, number> = {};
  fund.sectors.forEach(([sub, pct]) => { const p = fund.sectorParent[sub] ?? parentOf(sub); parentPct[p] = (parentPct[p] ?? 0) + pct; });
  /** Exposure of the ETF to a sub-sector: exact match; otherwise half credit through the parent
      sector, but only when the ETF is substantially in that parent (≥ 20%). */
  const exposure = (sub: string) => {
    if (subPct[sub]) return subPct[sub];
    const p = parentPct[parentOf(sub)] ?? 0;
    return p >= 20 ? p * 0.5 : 0;
  };

  const from = Math.floor(Date.now() / 1000) - days * 86400;
  const articles = await queryArchive({ from, limit: 1000 });

  const company: EtfNewsItem[] = [], sector: EtfNewsItem[] = [], macro: EtfNewsItem[] = [];
  const covered = new Set<string>();
  const perSub: Record<string, number> = {};

  for (const a of articles) {
    const held = a.relevant.filter((t) => weight[t]).map((t) => ({ tic: t, w: +weight[t].toFixed(2) }));
    const secs = a.subs.map((sub) => ({ sub, pct: +exposure(sub).toFixed(1) })).filter((x) => x.pct >= 3).sort((x, y) => y.pct - x.pct);
    if (held.length) {
      held.forEach((h) => covered.add(h.tic));
      secs.forEach((x) => (perSub[x.sub] = (perSub[x.sub] ?? 0) + 1));
      company.push({ ...strip(a), holdings: held, sectors: secs, score: held.reduce((s, h) => s + h.w, 0) });
    } else if ((a.kind === "sector" || a.kind === "company") && secs.length) {
      // industry news, or a peer the ETF doesn't own — relevant through sector exposure
      secs.forEach((x) => (perSub[x.sub] = (perSub[x.sub] ?? 0) + 1));
      sector.push({ ...strip(a), holdings: [], sectors: secs, score: secs[0].pct });
    } else if (a.kind === "macro") {
      macro.push({ ...strip(a), holdings: [], sectors: [], score: 0 });
    }
  }

  // Newest first, but drop weak sector matches when there are plenty of strong ones.
  const strongSector = sector.filter((x) => x.score >= 5);
  return {
    tic: fund.tic,
    name: fund.name,
    days,
    company: company.slice(0, limit),
    sector: (strongSector.length >= 10 ? strongSector : sector).slice(0, limit),
    macro: macro.slice(0, 15),
    coverage: +[...covered].reduce((s, t) => s + (weight[t] ?? 0), 0).toFixed(1),
    topSectors: fund.sectors.filter(([sub]) => !["Other Holdings", "Cash & Other"].includes(sub)).slice(0, 5).map(([sub, pct]) => ({ sub, pct, articles: perSub[sub] ?? 0 })),
  };
}
