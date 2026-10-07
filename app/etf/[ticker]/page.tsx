import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DeepView from "@/components/deep-view/DeepView";
import { buildFund, DEEP_VIEW_TICKERS } from "@/components/deep-view/buildFund";

type Params = { params: Promise<{ ticker: string }> };

// Pre-render a Deep View page for every ETF in the scanner.
export function generateStaticParams() {
  return DEEP_VIEW_TICKERS.map((ticker) => ({ ticker }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { ticker } = await params;
  const fund = buildFund(ticker);
  return { title: fund ? `${fund.tic} · ${fund.name} | INFERNO ETF` : "ETF not found | INFERNO ETF" };
}

export default async function EtfDeepViewPage({ params }: Params) {
  const { ticker } = await params;
  const fund = buildFund(ticker);
  if (!fund) notFound();
  return <DeepView fund={fund} />;
}
