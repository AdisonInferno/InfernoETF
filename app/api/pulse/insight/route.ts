import { queryArchive } from "@/lib/news-archive/store";
import { insightFor } from "@/lib/intel/news-insight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/pulse/insight?id=finnhub:abc → AI summary + per-ticker impact (computed once, then cached on disk). */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[a-z]+:[\w-]{2,64}$/i.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });
  const a = (await queryArchive({ from: 0, limit: 100000 })).find((x) => x.id === id);
  if (!a) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    return Response.json(await insightFor({ id: a.id, headline: a.headline, summary: a.summary, source: a.source, tickers: a.relevant.slice(0, 3) }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    return Response.json({ error: /429|RESOURCE_EXHAUSTED/.test(msg) ? "Dzienny limit Gemini wyczerpany" : msg.slice(0, 200) }, { status: 502 });
  }
}
