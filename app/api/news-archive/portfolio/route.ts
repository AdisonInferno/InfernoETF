import { fundNews } from "@/lib/news-archive/etf";
import { buildPortfolioFund, type PItem } from "@/lib/portfolio-fund";
import { invalidateCleaned, queryArchive, saveArticles } from "@/lib/news-archive/store";
import { registerAliases } from "@/lib/news-archive/quality";
import { finnhubCompany, hasFinnhub, yahooLatest } from "@/lib/news-archive/sources";

/** Stocks outside the collector's universe (e.g. SPOT) have no archived company news yet:
 *  fetch them on demand (Finnhub company news + Yahoo latest) and store them, so they stay archived. */
async function ensureCompanyNews(items: PItem[], days: number) {
  const from = Math.floor(Date.now() / 1000) - days * 86400;
  const stocks = items.filter((i) => i.kind === "stock").slice(0, 5);
  // company name → alias, so "Spotify" in a headline counts as news about SPOT
  if (stocks.map((s) => registerAliases(s.ticker, s.name)).some(Boolean)) invalidateCleaned();
  await Promise.all(stocks.map(async ({ ticker }) => {
    const have = await queryArchive({ ticker, from, limit: 1, includeLow: true }).catch(() => []);
    if (have.length) return;
    const got = (await Promise.all([
      hasFinnhub() ? finnhubCompany(ticker, new Date(from * 1000), new Date()).catch(() => []) : Promise.resolve([]),
      yahooLatest(ticker).catch(() => []),
    ])).flat();
    if (got.length) await saveArticles(got).catch(() => null);
  }));
}

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
  await ensureCompanyNews(items, days);
  return Response.json(await fundNews(buildPortfolioFund(items), days));
}
