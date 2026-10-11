import { recentFilings } from "@/lib/intel/sec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/intel/filings?ticker=NVDA → latest SEC filings of one company (any US-registered ticker). */
export async function GET(req: Request) {
  const t = (new URL(req.url).searchParams.get("ticker") ?? "").toUpperCase().trim();
  if (!/^[A-Z][A-Z0-9.]{0,7}$/.test(t)) return Response.json({ error: "Bad ticker" }, { status: 400 });
  return Response.json(await recentFilings([t], 12));
}
