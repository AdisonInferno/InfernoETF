export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET  /api/prices/warm → state of the 3-hourly price refresh (last run, symbols, duration)
   POST /api/prices/warm → refresh now (localhost, or NEWS_ARCHIVE_TOKEN elsewhere — it spends API calls) */
import { warmNow, warmState } from "@/lib/price-store";
import { denied } from "@/lib/news-archive/guard";

export async function GET() {
  return Response.json({ warm: warmState() });
}

export async function POST(req: Request) {
  const no = denied(req);
  if (no) return no;
  return Response.json({ warm: await warmNow() });
}
