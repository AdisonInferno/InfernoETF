/* Server-only provider adapters → ArchivedArticle[].
 *
 *   Finnhub  (FINNHUB_API_KEY)  general market news + company news with a date range (history).
 *   Yahoo    (no key)           latest headlines per ticker, no history — fills gaps between runs.
 *
 * Base URLs can be overridden (FINNHUB_BASE_URL / YAHOO_BASE_URL) for testing. */

import { PROFILE_OF } from "@/lib/fund-profiles";
import { articleId, type ArchivedArticle } from "./store";
import { TICKER_SUB, parentOf } from "./sectors";

/** Holdings that are futures, coins, cash or T-bills — no company news exists for them. */
const NOT_A_COMPANY = new Set(["Commodities", "Crypto", "Govt Bonds", "Cash & Other"]);

const FINNHUB = process.env.FINNHUB_BASE_URL ?? "https://finnhub.io/api/v1";
const YAHOO = process.env.YAHOO_BASE_URL ?? "https://query1.finance.yahoo.com";
const now = () => Math.floor(Date.now() / 1000);
const day = (d: Date) => d.toISOString().slice(0, 10);

export const hasFinnhub = () => Boolean(process.env.FINNHUB_API_KEY);

/* ── Ticker universe: the most important stocks inside our ETFs ── */

// Finnhub's free company-news covers North American listings; skip clearly non-US tickers.
const NON_US = new Set([
  "RHM", "NESN", "ROG", "SAP", "NOVN", "MC", "SIE", "AIR", "SAF", "HO", "LDO", "HSBA", "ULVR", "ABBN", "MTX", "KOG", "HAG",
  "AM", "CHG", "IBE", "VWS", "SSE", "KAP", "IVN", "LUN", "ANTO", "ADYEN", "ALV", "BAE", "SAAB", "THALES", "HENS",
]);

/** Tickers to collect: the top `n` stocks by summed ETF weight, plus the top `perEtf` US-listed
    holdings of every ETF so thematic funds (defense, uranium, …) get company news too.
    Override everything with NEWS_TICKERS="AAPL,MSFT,…". */
export function newsUniverse(n = 40, perEtf = 5): string[] {
  const env = process.env.NEWS_TICKERS?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (env?.length) return env;
  const ok = (t: string) => /^[A-Z]{1,5}$/.test(t) && !NON_US.has(t) && !NOT_A_COMPANY.has(parentOf(TICKER_SUB[t] ?? ""));
  const score: Record<string, number> = {};
  const picked = new Set<string>();
  for (const prof of new Set(Object.values(PROFILE_OF))) {
    const lines = prof.holdings.map((l) => l.split("|")).map(([t, , w]) => [t === "GOOG" ? "GOOGL" : t, Number(w)] as const).filter(([t]) => ok(t));
    lines.forEach(([t, w]) => (score[t] = (score[t] ?? 0) + w));
    [...lines].sort((a, b) => b[1] - a[1]).slice(0, perEtf).forEach(([t]) => picked.add(t));
  }
  Object.entries(score).sort((a, b) => b[1] - a[1]).slice(0, n).forEach(([t]) => picked.add(t));
  return [...picked];
}

/* ── Finnhub ── */

interface FinnhubNews { id?: number; datetime: number; headline: string; summary?: string; source?: string; url?: string; related?: string; category?: string }

async function finnhub(pathAndQuery: string): Promise<FinnhubNews[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("FINNHUB_API_KEY missing");
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const res = await fetch(`${FINNHUB}${pathAndQuery}${sep}token=${key}`, { cache: "no-store" });
  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) throw new Error(`Finnhub ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function fromFinnhub(items: FinnhubNews[], tickers: string[], category: string): ArchivedArticle[] {
  const collectedAt = now();
  return items
    .filter((n) => n.headline && n.datetime)
    .map((n) => {
      const related = (n.related ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      return {
        id: articleId("finnhub", n.id ?? n.url ?? n.headline),
        provider: "finnhub" as const,
        ts: n.datetime,
        headline: n.headline.trim(),
        summary: (n.summary ?? "").trim(),
        source: n.source ?? "Finnhub",
        url: n.url ?? "",
        tickers: [...new Set([...tickers, ...related])],
        category: n.category ?? category,
        collectedAt,
      };
    });
}

/** General market headlines (latest ~100). */
export async function finnhubGeneral(): Promise<ArchivedArticle[]> {
  return fromFinnhub(await finnhub("/news?category=general"), [], "general");
}

/** Company news for one ticker in a date window (Finnhub free: about 1 year back). */
export async function finnhubCompany(ticker: string, from: Date, to: Date): Promise<ArchivedArticle[]> {
  return fromFinnhub(await finnhub(`/company-news?symbol=${encodeURIComponent(ticker)}&from=${day(from)}&to=${day(to)}`), [ticker], "company");
}

/* ── Yahoo (no key, latest only) ── */

interface YahooNews { uuid?: string; title: string; publisher?: string; link?: string; providerPublishTime: number; relatedTickers?: string[] }

export async function yahooLatest(ticker: string): Promise<ArchivedArticle[]> {
  const res = await fetch(`${YAHOO}/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=0&newsCount=20`, {
    headers: { "User-Agent": "Mozilla/5.0 (InfernoETF news archive)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const json = await res.json();
  const collectedAt = now();
  return ((json?.news ?? []) as YahooNews[])
    .filter((n) => n.title && n.providerPublishTime)
    .map((n) => ({
      id: articleId("yahoo", n.uuid ?? n.link ?? n.title),
      provider: "yahoo" as const,
      ts: n.providerPublishTime,
      headline: n.title.trim(),
      summary: "",
      source: n.publisher ?? "Yahoo Finance",
      url: n.link ?? "",
      tickers: [...new Set([ticker, ...(n.relatedTickers ?? []).map((t) => t.toUpperCase())])],
      category: "company",
      collectedAt,
    }));
}
