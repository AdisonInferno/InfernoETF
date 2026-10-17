import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StockDeepView from "@/components/stock/StockDeepView";

type Params = { params: Promise<{ ticker: string }>; searchParams?: Promise<{ y?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} · Stock Deep Dive | INFERNO` };
}

/** Stock Deep Dive — overview, financials (SEC), charts, news, ETF exposure. Data loads client-side from /api/stock. */
export default async function StockPage({ params, searchParams }: Params) {
  const { ticker } = await params;
  // ?y=CDR.WA — Yahoo symbol for stocks listed outside the US (prices / chart); SEC data only exists for US filers
  const y = (await searchParams)?.y?.toUpperCase();
  const t = decodeURIComponent(ticker).toUpperCase();
  if (!/^[A-Z0-9.^-]{1,12}$/.test(t)) notFound();
  return <StockDeepView ticker={t} yahoo={y && /^[A-Z0-9.^=-]{1,15}$/.test(y) ? y : t} />;
}
