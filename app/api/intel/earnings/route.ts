import { earningsBoard } from "@/lib/intel/earnings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/intel/earnings?back=14&fwd=21 → { reported (by impact, with price reaction), upcoming (by date) } */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const back = Math.min(45, Math.max(1, Number(p.get("back") ?? 14) || 14));
  const fwd = Math.min(45, Math.max(1, Number(p.get("fwd") ?? 21) || 21));
  const { rows, error } = await earningsBoard(back, fwd);
  const reported = rows.filter((r) => r.reported).sort((a, b) => b.impact - a.impact || b.date.localeCompare(a.date));
  const upcoming = rows.filter((r) => !r.reported).sort((a, b) => a.date.localeCompare(b.date) || b.impact - a.impact);
  return Response.json({ reported, upcoming, error });
}
