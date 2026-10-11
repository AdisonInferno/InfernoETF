import { commodityByName } from "@/lib/intel/commodities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/intel/commodity?name=Gold → news about one commodity (any sector), last 14 days. */
export async function GET(req: Request) {
  const name = (new URL(req.url).searchParams.get("name") ?? "").trim();
  if (!/^[\p{L}\d][\p{L}\d &/-]{0,39}$/u.test(name)) return Response.json({ error: "Bad name" }, { status: 400 });
  return Response.json(await commodityByName(name, 14, 12));
}
