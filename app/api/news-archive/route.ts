import { archiveStats, queryArchive } from "@/lib/news-archive/store";
import { jobState } from "@/lib/news-archive/collector";
import { hasFinnhub, newsUniverse } from "@/lib/news-archive/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/news-archive?ticker=NVDA&q=chip&days=90&limit=50 → { stats, job, articles } */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const days = Number(u.searchParams.get("days") ?? 0);
  const articles = await queryArchive({
    ticker: u.searchParams.get("ticker") || undefined,
    q: u.searchParams.get("q") || undefined,
    from: days > 0 ? Math.floor(Date.now() / 1000) - days * 86400 : undefined,
    limit: Number(u.searchParams.get("limit") ?? 50),
  });
  return Response.json({ stats: await archiveStats(), job: jobState(), finnhub: hasFinnhub(), universe: newsUniverse(), articles });
}
