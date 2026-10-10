import type { NextRequest } from "next/server";
import { etfNews } from "@/lib/news-archive/etf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/news-archive/etf/ITA?days=30 → company + sector + macro news for the ETF */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/news-archive/etf/[ticker]">) {
  const { ticker } = await ctx.params;
  const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  const data = await etfNews(ticker.toUpperCase(), days);
  return data ? Response.json(data) : Response.json({ error: "Unknown ETF" }, { status: 404 });
}
