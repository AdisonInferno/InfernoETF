import { upcoming } from "@/lib/intel/calendar";
import { rankAwaited } from "@/lib/intel/awaited";
import { newsUniverse } from "@/lib/news-archive/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/intel/awaited?days=21 → { events: Awaited[], missing } — top upcoming events by market impact. */
export async function GET(req: Request) {
  const d = Number(new URL(req.url).searchParams.get("days") ?? 21);
  const days = Number.isFinite(d) ? Math.min(60, Math.max(3, d)) : 21;
  const { events, missing } = await upcoming(newsUniverse(), days);
  return Response.json({ events: rankAwaited(events, 10), missing });
}
