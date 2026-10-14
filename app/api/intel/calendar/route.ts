import { monthEvents } from "@/lib/intel/calendar";
import { newsUniverse } from "@/lib/news-archive/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/intel/calendar?month=2026-10 → { events, missing } for that calendar month. */
export async function GET(req: Request) {
  const m = new URL(req.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return Response.json({ error: "Bad month" }, { status: 400 });
  return Response.json(await monthEvents(m, newsUniverse()));
}
