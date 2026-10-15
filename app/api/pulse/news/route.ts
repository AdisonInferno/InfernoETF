import { queryArchive } from "@/lib/news-archive/store";
import { score } from "@/lib/intel/sentiment";
import { cachedMany } from "@/lib/intel/news-insight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/pulse/news?limit=12 → latest market-moving headlines with a quick tone (lexicon) and,
    if already analysed, the cached AI insight. */
export async function GET(req: Request) {
  const limit = Math.min(20, Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? 12)));
  const now = Math.floor(Date.now() / 1000);
  let arts = await queryArchive({ from: now - 86400, limit: 200 });
  if (arts.length < 6) arts = await queryArchive({ from: now - 7 * 86400, limit: 200 });
  const list = arts.slice(0, limit);
  const ins = await cachedMany(list.map((a) => a.id));
  return Response.json({
    news: list.map((a) => ({
      id: a.id, ts: a.ts, headline: a.headline, url: a.url, source: a.source,
      tickers: a.relevant.slice(0, 3),
      tone: Math.round(score(a) * 100) / 100,
      insight: ins[a.id] ?? null,
    })),
  });
}
