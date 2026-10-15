import { queryArchive } from "@/lib/news-archive/store";
import { yahooLatest } from "@/lib/news-archive/sources";
import type { ArchivedArticle } from "@/lib/news-archive/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/holdings-news?tickers=NVDA,AVGO → { news: [{ id, ts, headline, url, source, tickers }] }
   News strictly about the given companies: our archive first, topped up live from Yahoo (cached 15 min). */
const g = globalThis as typeof globalThis & { __infernoHN?: Map<string, { at: number; list: ArchivedArticle[] }> };
const cache = (g.__infernoHN ??= new Map());

async function live(t: string): Promise<ArchivedArticle[]> {
  const hit = cache.get(t);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.list;
  let list: ArchivedArticle[] = [];
  try { list = await yahooLatest(t); } catch { /* offline */ }
  cache.set(t, { at: Date.now(), list });
  return list;
}

export async function GET(req: Request) {
  const tickers = (new URL(req.url).searchParams.get("tickers") ?? "").split(",").map((x) => x.trim().toUpperCase())
    .filter((x) => /^[A-Z][A-Z0-9.]{0,7}$/.test(x)).slice(0, 8);
  const from = Math.floor(Date.now() / 1000) - 14 * 86400;
  const seen = new Set<string>();
  const out: { id: string; ts: number; headline: string; url: string; source: string; tickers: string[] }[] = [];
  const push = (id: string, ts: number, headline: string, url: string, source: string, tks: string[]) => {
    const k = headline.toLowerCase().replace(/\W+/g, " ").trim();
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ id, ts, headline, url, source, tickers: [...new Set(tks)].filter((x) => tickers.includes(x)) });
  };
  for (const t of tickers) for (const a of await queryArchive({ ticker: t, from, limit: 8 })) push(a.id, a.ts, a.headline, a.url, a.source, a.relevant.length ? a.relevant : [t]);
  const lives = await Promise.all(tickers.map(live));
  lives.forEach((list, i) => list.filter((a) => a.ts >= from).slice(0, 6).forEach((a) => push(a.id, a.ts, a.headline, a.url, a.source, [tickers[i], ...a.tickers])));
  out.sort((a, b) => b.ts - a.ts);
  return Response.json({ news: out.slice(0, 30) });
}
