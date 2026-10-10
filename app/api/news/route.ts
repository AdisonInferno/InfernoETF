import { NextRequest } from "next/server";
import { getSectorNews, getTickerNews } from "@/lib/market-news";

// GET /api/news            → global / sector feed
// GET /api/news?tickers=.. → personalized feed for portfolio tickers
export async function GET(req: NextRequest) {
  const tickers = req.nextUrl.searchParams.get("tickers");
  const data = tickers ? await getTickerNews(tickers.split(",")) : await getSectorNews();
  return Response.json(data);
}
