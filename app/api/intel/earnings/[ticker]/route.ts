import type { NextRequest } from "next/server";
import { stockData } from "@/lib/stock/data";
import { recentFilings } from "@/lib/intel/sec";
import { insightFor } from "@/lib/intel/filing-insight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/intel/earnings/NVDA → earnings deep dive: results press release read (8-K item 2.02),
    quarterly financials (SEC XBRL) and EPS actual vs estimate history. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  if (!/^[A-Z0-9.-]{1,10}$/i.test(ticker)) return Response.json({ error: "Bad ticker" }, { status: 400 });
  const t = ticker.toUpperCase();
  const [d, f] = await Promise.all([stockData(t), recentFilings([t], 40).catch(() => ({ filings: [] }))]);
  const release = f.filings.find((x) => x.form === "8-K" && x.items.includes("2.02")) ?? null;
  const read = release
    ? await insightFor({ ticker: t, cik: release.cik, form: release.form, accession: release.accession, doc: release.doc, items: release.items }).catch(() => null)
    : null;
  return Response.json({
    ticker: t, name: d.name, sector: d.sector, industry: d.industry, currency: d.finCurrency || d.currency,
    price: d.price, marketCap: d.marketCap, pe: d.pe, forwardPe: d.forwardPe,
    quarters: d.quarters.slice(-6), earnings: d.earnings.slice(0, 8),
    release: release ? { url: release.url, at: release.acceptedAt, description: release.description } : null,
    read,
  });
}
