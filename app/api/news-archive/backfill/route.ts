import { startBackfill } from "@/lib/news-archive/collector";
import { denied } from "@/lib/news-archive/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { days: 365 } → walks Finnhub company news back up to `days` (resumable). */
export async function POST(req: Request) {
  const no = denied(req);
  if (no) return no;
  const body = await req.json().catch(() => ({}));
  const r = startBackfill(Number((body as { days?: number }).days ?? 365));
  return Response.json(r, { status: r.started ? 200 : 409 });
}
