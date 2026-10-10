import { collectNow, jobState } from "@/lib/news-archive/collector";
import { denied } from "@/lib/news-archive/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST → starts a "latest news" collection in the background. */
export async function POST(req: Request) {
  const no = denied(req);
  if (no) return no;
  if (jobState().running) return Response.json({ started: false, reason: "A job is already running" }, { status: 409 });
  void collectNow();
  return Response.json({ started: true });
}
