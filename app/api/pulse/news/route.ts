import { getMarketContext, levelOf, type Timeframe } from "@/lib/news-archive/marketContextStore";
import { cachedMany } from "@/lib/intel/news-insight";
import { collectNow, jobState } from "@/lib/news-archive/collector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TF: Record<string, Timeframe> = { d: "DAILY", w: "WEEKLY", m: "MONTHLY" };

/** GET /api/pulse/news?limit=25&range=d|w|m&order=impact|newest
    → market-moving events from the structured market-context store (deduped, categorised, scored).
    Empty archive (fresh install / no key) → curated SAMPLE events + a collection run is started. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(40, Math.max(1, Number(sp.get("limit") ?? 25) || 25));
  const timeframe = TF[sp.get("range") ?? "d"] ?? "DAILY";
  const order = sp.get("order") === "newest" ? "newest" : "impact";
  const { events, live } = await getMarketContext({ timeframe, limit, order });
  if (!live && !jobState().running) void collectNow().catch(() => {});
  const ins = await cachedMany(events.map((e) => e.ref).filter((x): x is string => !!x));
  return Response.json({
    range: sp.get("range") ?? "d", timeframe, live,
    collecting: jobState().running,
    news: events.map((e) => ({
      id: e.ref ?? e.id, ts: Math.floor(Date.parse(e.timestamp_utc) / 1000), headline: e.headline, url: e.url, source: e.source,
      tickers: e.affected_tickers.slice(0, 3), tone: e.impact_score,
      impact: levelOf(e.magnitude), impactPts: e.magnitude,
      category: e.macro_category, impactScore: e.impact_score, vol: e.volatility_flag, sample: !!e.sample,
      insight: (e.ref && ins[e.ref]) || null,
    })),
  });
}
