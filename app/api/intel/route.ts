import { recentFilings } from "@/lib/intel/sec";
import { upcoming } from "@/lib/intel/calendar";
import { MAIN_COMMODITIES, commodityNews, macroNews } from "@/lib/intel/commodities";
import { focusById } from "@/lib/intel/focus";
import { newsUniverse } from "@/lib/news-archive/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/intel?region=global|us|eu|asia&sector=defense
    → { filings (sector filers), commodities (sector + all), macro { calendar, news } } */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const r = p.get("region");
  const region = r === "us" || r === "eu" || r === "asia" ? r : "global";
  const sector = focusById(p.get("sector") ?? "tech");
  // GLOBAL = every region's filers, interleaved so the big names of each region come first
  const filers = region === "global"
    ? [...new Set(Array.from({ length: 15 }, (_, i) => [sector.filers.us[i], sector.filers.eu[i], sector.filers.asia[i]]).flat().filter(Boolean) as string[])]
    : sector.filers[region];
  const [filings, commodities, calendar, news] = await Promise.all([
    recentFilings(filers, 20),
    commodityNews(sector.id, 14, 16),
    upcoming(newsUniverse(), 14),
    macroNews(14, 12),
  ]);
  return Response.json({ region, sector: sector.id, picks: { filers: filers.slice(0, 6), commodities: MAIN_COMMODITIES }, filings, commodities, macro: { calendar, news } });
}
