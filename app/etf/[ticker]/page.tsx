import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DeepView from "@/components/deep-view/DeepView";
import type { ChartTf } from "@/components/InfernoChart";
import { buildFund, DEEP_VIEW_TICKERS } from "@/components/deep-view/buildFund";

type Params = { params: Promise<{ ticker: string }> };
/** ?tf= — opened from the market map on this timeframe */
type PageArgs = Params & { searchParams: Promise<{ tf?: string | string[] }> };
const OPEN_TFS = new Set(["1D", "1W", "1M", "3M", "YTD", "1Y", "3Y", "5Y", "MAX"]);

// Pre-render a Deep View page for every ETF in the scanner.
export function generateStaticParams() {
  return DEEP_VIEW_TICKERS.map((ticker) => ({ ticker }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { ticker } = await params;
  const fund = buildFund(ticker);
  return { title: fund ? `${fund.tic} · ${fund.name} | OASIS` : "ETF not found | OASIS" };
}

export default async function EtfDeepViewPage({ params, searchParams }: PageArgs) {
  const { ticker } = await params;
  const raw = (await searchParams).tf;
  const tf = typeof raw === "string" && OPEN_TFS.has(raw) ? (raw as ChartTf) : undefined;
  const fund = buildFund(ticker);
  if (!fund) notFound();
  return <DeepView fund={fund} initialTf={tf} />;
}
