import { focusSentiment, type Region } from "@/lib/intel/sentiment";
import { recentFilings } from "@/lib/intel/sec";
import { upcoming } from "@/lib/intel/calendar";
import { commodityNews, macroNews } from "@/lib/intel/commodities";
import { focusById } from "@/lib/intel/focus";
import { newsUniverse } from "@/lib/news-archive/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/intel?region=us&sector=defense
    → { sentiment (focus sectors), filings (sector filers), commodities (sector + all), macro { calendar, news } } */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const r = p.get("region");
  const region: Region = r === "eu" || r === "asia" ? r : "us";
  const sector = focusById(p.get("sector") ?? "tech");
  const [sentiment, filings, commodities, calendar, news] = await Promise.all([
    focusSentiment(region, 7),
    recentFilings(sector.filers[region], 10),
    commodityNews(sector.id, 7, 10),
    upcoming(newsUniverse(), 14),
    macroNews(7, 6),
  ]);
  return Response.json({ region, sector: sector.id, sentiment, filings, commodities, macro: { calendar, news } });
}
