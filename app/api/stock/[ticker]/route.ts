import type { NextRequest } from "next/server";
import { stockData } from "@/lib/stock/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/stock/NVDA → profile, valuation, quarterly financials (SEC), EPS estimate vs actual, earnings dates, peers */
export async function GET(req: NextRequest, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  if (!/^[A-Z0-9.^-]{1,12}$/i.test(ticker)) return Response.json({ error: "Bad ticker" }, { status: 400 });
  const y = req.nextUrl.searchParams.get("y")?.toUpperCase();
  return Response.json(await stockData(ticker, y && /^[A-Z0-9.^=-]{1,15}$/.test(y) ? y : undefined));
}
