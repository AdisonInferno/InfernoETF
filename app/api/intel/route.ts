import { sectorSentiment, type Region } from "@/lib/intel/sentiment";
import { recentFilings } from "@/lib/intel/sec";
import { upcoming } from "@/lib/intel/calendar";
import { newsUniverse } from "@/lib/news-archive/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Companies whose SEC filings we follow per region (EU/Asia = US-listed ADRs filing 6-K/20-F). */
const SEC_TICKERS: Record<Region, string[]> = {
  us: ["NVDA", "MSFT", "AAPL", "AMZN", "META", "GOOGL", "AVGO", "TSLA", "JPM", "LMT", "RTX", "NOC", "GD", "XOM", "CVX", "LLY", "UNH", "CCJ", "PLTR", "AMD"],
  eu: ["ASML", "SHEL", "AZN", "TTE", "SAP", "NVO", "UL", "BP", "HSBC", "GSK", "ARM", "SPOT"],
  asia: ["TSM", "BABA", "PDD", "NTES", "TCOM", "INFY", "IBN", "HDB", "JD", "BIDU", "SONY", "TM"],
};

/** GET /api/intel?region=us → { sentiment, filings, calendar } */
export async function GET(req: Request) {
  const r = new URL(req.url).searchParams.get("region");
  const region: Region = r === "eu" || r === "asia" ? r : "us";
  const [sentiment, filings, calendar] = await Promise.all([
    sectorSentiment(region, 7),
    recentFilings(SEC_TICKERS[region], 8),
    upcoming(newsUniverse(), 14),
  ]);
  return Response.json({ region, sentiment, filings, calendar });
}
