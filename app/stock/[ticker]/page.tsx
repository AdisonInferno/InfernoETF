import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DEEP_VIEW_TICKERS } from "@/components/deep-view/buildFund";
import StockDeepView from "@/components/stock/StockDeepView";
import { toYahoo } from "@/lib/yahoo";

type Params = { params: Promise<{ ticker: string }>; searchParams?: Promise<{ y?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} · Stock Deep Dive | OASIS` };
}

/** Stock Deep Dive — overview, financials (SEC), charts, news, ETF exposure. Data loads client-side from /api/stock. */
export default async function StockPage({ params, searchParams }: Params) {
  const { ticker } = await params;
  // ?y=CDR.WA — Yahoo symbol for stocks listed outside the US (prices / chart); SEC data only exists for US filers
  const y = (await searchParams)?.y?.toUpperCase();
  const t = decodeURIComponent(ticker).toUpperCase();
  if (!/^[A-Z0-9.^-]{1,12}$/.test(t)) notFound();
  // ETFs in the database have their own deep view (composition, drivers …) — an ETF never opens as a stock
  if (DEEP_VIEW_TICKERS.includes(t)) redirect(`/etf/${t}`);
  return <StockDeepView ticker={t} yahoo={y && /^[A-Z0-9.^=-]{1,15}$/.test(y) ? y : toYahoo(t)} />;
}
