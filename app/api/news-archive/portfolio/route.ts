import { fundNews } from "@/lib/news-archive/etf";
import { buildPortfolioFund, type PItem } from "@/lib/portfolio-fund";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/news-archive/portfolio?days=30  body: { items: PItem[] } → company + sector + macro news for the whole portfolio */
export async function POST(req: Request) {
  const days = Math.max(1, Math.min(365, Number(new URL(req.url).searchParams.get("days") ?? 30)));
  const body = (await req.json().catch(() => null)) as { items?: PItem[] } | null;
  const items = (body?.items ?? [])
    .filter((i) => i && typeof i.ticker === "string" && /^[A-Z0-9.^=-]{1,12}$/i.test(i.ticker) && Number.isFinite(i.weight) && i.weight > 0)
    .slice(0, 60)
    .map((i) => ({ ticker: i.ticker.toUpperCase(), name: String(i.name ?? i.ticker).slice(0, 80), weight: +i.weight, kind: i.kind === "etf" ? "etf" : "stock", sector: String(i.sector ?? "Other").slice(0, 40), ytd: Number(i.ytd) || 0, chg1d: Number(i.chg1d) || 0 }) as PItem);
  if (!items.length) return Response.json({ error: "No positions" }, { status: 400 });
  return Response.json(await fundNews(buildPortfolioFund(items), days));
}
