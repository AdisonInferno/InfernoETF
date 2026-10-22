import { getMarketContext, getMarketContextForAI, type MacroCategory, type Timeframe } from "@/lib/news-archive/marketContextStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/news/context?timeframe=DAILY|WEEKLY|MONTHLY&ticker=NVDA&minImpact=0.3&category=MONETARY&format=json|md
    → structured market events (json) or the compact LLM grounding block (md). */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const tf = p.get("timeframe")?.toUpperCase();
  const timeframe = (["DAILY", "WEEKLY", "MONTHLY"].includes(tf ?? "") ? tf : "WEEKLY") as Timeframe;
  const ticker = p.get("ticker")?.toUpperCase().slice(0, 10) || undefined;
  const mi = Number(p.get("minImpact"));
  const minImpact = Number.isFinite(mi) && p.has("minImpact") ? Math.max(0, Math.min(1, mi)) : undefined;
  const cat = p.get("category")?.toUpperCase() as MacroCategory | undefined;
  const q = { timeframe, ticker, minImpact, category: cat, limit: Math.min(100, Number(p.get("limit")) || 40) };
  if (p.get("format") === "md") return new Response(await getMarketContextForAI(q), { headers: { "content-type": "text/markdown; charset=utf-8" } });
  return Response.json(await getMarketContext(q));
}
