import { summary, toYahoo } from "@/lib/yahoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/instrument?s=DFNS.UK → Yahoo fundamentals for any stock / ETF (AUM, TER, P/E, holdings …) */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams.get("s")?.toUpperCase() ?? "";
  if (!/^[A-Z0-9.^=-]{1,15}$/.test(s)) return Response.json({ error: "Bad symbol" }, { status: 400 });
  return Response.json(await summary(toYahoo(s)));
}
