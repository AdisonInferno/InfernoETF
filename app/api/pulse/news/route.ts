import { queryArchive } from "@/lib/news-archive/store";
import type { CleanArticle } from "@/lib/news-archive/quality";
import { score } from "@/lib/intel/sentiment";
import { cachedMany } from "@/lib/intel/news-insight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* How market-moving is a headline? Transparent rule score (no AI quota spent):
   · market-moving event words (Fed, CPI, earnings, guidance, M&A, tariffs, downgrade …)  +2 (+1 per extra, max +3)
   · strong tone (lexicon)                                                                 up to +2
   · mega-cap companies involved                                                           +1 each (max +2)
   · same story carried by several providers                                               +1 per copy (max +2)
   · macro story (rates / whole market)                                                    +1
   · tier-1 source (Reuters, Bloomberg, WSJ, FT, CNBC …)                                   +1
   impact 3 = score ≥ 5 · 2 = score ≥ 2.5 · 1 = rest */
const EVENT = /\b(fed|fomc|powell|rate (cut|hike)s?|interest rates?|inflation|cpi|ppi|payrolls?|jobs report|unemployment|gdp|recession|tariffs?|sanctions?|opec|earnings|results|guidance|forecast|outlook|beats?|miss(es|ed)?|revenue|profit warning|acquisitions?|acquires?|merger|buyout|takeover|deal|bankrupt\w*|default|lawsuit|probe|investigation|antitrust|downgrades?|upgrades?|layoffs?|job cuts|recall|record high|all-time high|plunges?|soars?|surges?|tumbles?|crash\w*|sell-?off|rall(y|ies)|war|strike|halt\w*|ipo|split|buyback|dividend)\b/gi;
const MEGA = new Set(["AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "AVGO", "BRK.B", "JPM", "LLY", "V", "MA", "XOM", "UNH", "TSM", "ORCL", "WMT", "NFLX", "AMD", "PLTR"]);
const TIER1 = /reuters|bloomberg|wall street journal|wsj|financial times|\bft\b|cnbc|barron|marketwatch|associated press|\bap\b/i;

function impact(a: CleanArticle, tone: number): { pts: number; level: 1 | 2 | 3 } {
  const hits = new Set((a.headline.match(EVENT) ?? []).map((w) => w.toLowerCase())).size;
  let pts = hits ? Math.min(3, 1 + hits) : 0;
  pts += Math.min(2, Math.abs(tone) * 2);
  pts += Math.min(2, a.relevant.filter((t) => MEGA.has(t)).length);
  pts += Math.min(2, a.dupes);
  if (a.kind === "macro") pts += 1;
  if (TIER1.test(a.source)) pts += 1;
  return { pts, level: pts >= 5 ? 3 : pts >= 2.5 ? 2 : 1 };
}

const DAYS = { d: 1, w: 7, m: 30 } as const;

/** GET /api/pulse/news?limit=12&range=d|w|m → the most market-moving headlines of the window,
    sorted by impact (then newest), each with impact 1-3, a quick tone and the cached AI insight. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(30, Math.max(1, Number(sp.get("limit") ?? 12)));
  const range = (sp.get("range") ?? "d") as keyof typeof DAYS;
  const days = DAYS[range] ?? 1;
  const now = Math.floor(Date.now() / 1000);
  let arts = await queryArchive({ from: now - days * 86400, limit: 2000 });
  if (range === "d" && arts.length < 6) arts = await queryArchive({ from: now - 3 * 86400, limit: 2000 });
  const ranked = arts
    .map((a) => { const tone = Math.round(score(a) * 100) / 100; return { a, tone, ...impact(a, tone) }; })
    .sort((x, y) => y.pts - x.pts || y.a.ts - x.a.ts)
    .slice(0, limit);
  const ins = await cachedMany(ranked.map((r) => r.a.id));
  return Response.json({
    range, days,
    news: ranked.map(({ a, tone, pts, level }) => ({
      id: a.id, ts: a.ts, headline: a.headline, url: a.url, source: a.source,
      tickers: a.relevant.slice(0, 3),
      tone, impact: level, impactPts: Math.round(pts * 10) / 10,
      insight: ins[a.id] ?? null,
    })),
  });
}
