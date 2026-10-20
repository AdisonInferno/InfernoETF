export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/prices?symbols=NVDA,SMH&range=1mo → { series: { [sym]: { t: number[] (unix s), c: number[], o?, h?, l? } } }
   Closes from the price store (memory → disk → Yahoo; refreshed every 3 h, intraday every 15 min). */
import { RANGES, getSeries, type PriceSeries } from "@/lib/price-store";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const range = (p.get("range") ?? "") in RANGES ? p.get("range")! : "1mo";
  const syms = (p.get("symbols") ?? "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z0-9^][A-Z0-9.^=-]{0,14}$/.test(x)).slice(0, 20);
  const out: Record<string, PriceSeries | null> = {};
  await Promise.all(syms.map(async (s) => { out[s] = await getSeries(s, range); }));
  return Response.json({ series: out });
}
