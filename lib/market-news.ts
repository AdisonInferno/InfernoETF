// Server-only: real market news + 1D quotes.
// Source: Finnhub (when FINNHUB_API_KEY is set in .env.local), otherwise Yahoo Finance RSS (no key).

export type Sector = "MACRO" | "TECH" | "ENERGY" | "FINANCIALS" | "HEALTHCARE" | "DEFENSE";

export const SECTOR_TICKERS: Record<Sector, string[]> = {
  MACRO: ["SPY", "TLT", "GLD", "UUP"],
  TECH: ["XLK", "SMH", "NVDA", "MSFT"],
  ENERGY: ["XLE", "XOP", "XOM", "CVX"],
  FINANCIALS: ["XLF", "KRE", "JPM", "GS"],
  HEALTHCARE: ["XLV", "IBB", "LLY", "UNH"],
  DEFENSE: ["ITA", "LMT", "RTX", "NOC"],
};

export const SECTOR_ETF: Record<Sector, string> = {
  MACRO: "SPY",
  TECH: "XLK",
  ENERGY: "XLE",
  FINANCIALS: "XLF",
  HEALTHCARE: "XLV",
  DEFENSE: "ITA",
};

export interface NewsItem {
  id: string;
  source: string;
  publishedAt: number; // ms epoch
  sector: string; // sector name or ticker (personalized)
  sentiment: -1 | 0 | 1;
  headline: string;
  summary: string;
  url: string;
  tickers: { t: string; d: number | null }[];
}

export interface NewsPayload {
  provider: "FINNHUB" | "YAHOO";
  items: NewsItem[];
  sectors: { l: Sector; v: number | null }[];
  fetchedAt: number;
}

/* ───────────── tiny in-memory cache (works regardless of Next cache config) ───────────── */

const TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: unknown }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  return data;
}

const UA = { "User-Agent": "Mozilla/5.0 (InfernoETF)" };

/* ───────────── quotes (Yahoo chart endpoint, no key) ───────────── */

async function quote(ticker: string): Promise<number | null> {
  return cached(`q:${ticker}`, async () => {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`,
        { headers: UA, cache: "no-store" }
      );
      if (!r.ok) return null;
      const j = await r.json();
      const m = j?.chart?.result?.[0]?.meta;
      const price = m?.regularMarketPrice;
      const prev = m?.chartPreviousClose ?? m?.previousClose;
      if (typeof price !== "number" || typeof prev !== "number" || !prev) return null;
      return ((price - prev) / prev) * 100;
    } catch {
      return null;
    }
  });
}

export async function quotes(tickers: string[]): Promise<Record<string, number | null>> {
  const uniq = [...new Set(tickers)];
  const vals = await Promise.all(uniq.map(quote));
  return Object.fromEntries(uniq.map((t, i) => [t, vals[i]]));
}

/* ───────────── sentiment: transparent keyword heuristic on the headline ───────────── */

const POS = /\b(beat|beats|surge|surges|soar|soars|rall(y|ies)|jump|jumps|gain|gains|record high|upgrade|upgraded|raise[sd]?|tops|strong|rebound|boost|outperform|bullish|climb|climbs)\b/i;
const NEG = /\b(miss|misses|slump|slumps|plunge|plunges|fall|falls|drop|drops|slide|slides|cut|cuts|downgrade|downgraded|weak|warn|warns|loss|losses|probe|lawsuit|tumble|tumbles|sink|sinks|bearish|layoffs?|recall)\b/i;
function sentiment(text: string): -1 | 0 | 1 {
  const p = POS.test(text), n = NEG.test(text);
  return p && !n ? 1 : n && !p ? -1 : 0;
}

/* ───────────── providers ───────────── */

interface Raw {
  source: string;
  publishedAt: number;
  headline: string;
  summary: string;
  url: string;
  related: string[];
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

async function yahoo(tickers: string[]): Promise<Raw[]> {
  return cached(`y:${tickers.join(",")}`, async () => {
    try {
      const r = await fetch(
        `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${tickers.join(",")}&region=US&lang=en-US`,
        { headers: UA, cache: "no-store" }
      );
      if (!r.ok) return [];
      const xml = await r.text();
      const out: Raw[] = [];
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const get = (tag: string) => {
          const x = m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
          return x ? decode(x[1]) : "";
        };
        const headline = get("title");
        if (!headline) continue;
        const text = headline + " " + get("description");
        out.push({
          source: (get("source") || "YAHOO FINANCE").toUpperCase(),
          publishedAt: Date.parse(get("pubDate")) || Date.now(),
          headline,
          summary: get("description"),
          url: get("link"),
          related: tickers.filter((t) => new RegExp(`\\b${t}\\b`).test(text)),
        });
      }
      return out;
    } catch {
      return [];
    }
  });
}

async function finnhub(tickers: string[], key: string): Promise<Raw[]> {
  const to = new Date();
  const from = new Date(Date.now() - 5 * 864e5);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const lists = await Promise.all(
    tickers.slice(0, 3).map((t) =>
      cached(`f:${t}`, async () => {
        try {
          const r = await fetch(
            `https://finnhub.io/api/v1/company-news?symbol=${t}&from=${d(from)}&to=${d(to)}&token=${key}`,
            { cache: "no-store" }
          );
          if (!r.ok) return [] as Raw[];
          const j: Array<{ source: string; datetime: number; headline: string; summary: string; url: string; related: string }> =
            await r.json();
          return j.slice(0, 15).map<Raw>((n) => ({
            source: (n.source || "FINNHUB").toUpperCase(),
            publishedAt: n.datetime * 1000,
            headline: n.headline,
            summary: n.summary,
            url: n.url,
            related: [t, ...(n.related || "").split(",").filter((x) => tickers.includes(x))],
          }));
        } catch {
          return [] as Raw[];
        }
      })
    )
  );
  return lists.flat();
}

async function rawNews(tickers: string[]): Promise<{ provider: NewsPayload["provider"]; raw: Raw[] }> {
  const key = process.env.FINNHUB_API_KEY;
  if (key) {
    const raw = await finnhub(tickers, key);
    if (raw.length) return { provider: "FINNHUB", raw };
  }
  return { provider: "YAHOO", raw: await yahoo(tickers) };
}

/* ───────────── public API ───────────── */

function build(raw: Raw[], label: string, fallbackTickers: string[], q: Record<string, number | null>): NewsItem[] {
  return raw.map((n) => {
    const tk = (n.related.length ? [...new Set(n.related)] : fallbackTickers.slice(0, 2)).slice(0, 3);
    return {
      id: n.url || n.headline,
      source: n.source,
      publishedAt: n.publishedAt,
      sector: label,
      sentiment: sentiment(n.headline),
      headline: n.headline,
      summary: n.summary.length > 280 ? n.summary.slice(0, 277) + "…" : n.summary,
      url: n.url,
      tickers: tk.map((t) => ({ t, d: q[t] ?? null })),
    };
  });
}

function dedupe(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items
    .filter((n) => {
      const k = n.headline.toLowerCase().slice(0, 80);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

export async function getSectorNews(): Promise<NewsPayload> {
  const sectors = Object.keys(SECTOR_TICKERS) as Sector[];
  const allTickers = sectors.flatMap((s) => SECTOR_TICKERS[s]);
  const [q, results] = await Promise.all([
    quotes(allTickers),
    Promise.all(sectors.map((s) => rawNews(SECTOR_TICKERS[s]))),
  ]);
  const items = dedupe(
    sectors.flatMap((s, i) => build(results[i].raw.slice(0, 12), s, SECTOR_TICKERS[s], q))
  );
  return {
    provider: results.some((r) => r.provider === "FINNHUB") ? "FINNHUB" : "YAHOO",
    items,
    sectors: sectors.map((s) => ({ l: s, v: q[SECTOR_ETF[s]] ?? null })),
    fetchedAt: Date.now(),
  };
}

export async function getTickerNews(tickers: string[]): Promise<NewsPayload> {
  const list = [...new Set(tickers.map((t) => t.toUpperCase()).filter((t) => /^[A-Z.\-]{1,6}$/.test(t)))].slice(0, 8);
  if (!list.length) return { provider: "YAHOO", items: [], sectors: [], fetchedAt: Date.now() };
  const [q, perTicker] = await Promise.all([quotes(list), Promise.all(list.map((t) => rawNews([t])))]);
  const items = dedupe(list.flatMap((t, i) => build(perTicker[i].raw.slice(0, 8), t, [t], q)));
  return {
    provider: perTicker.some((r) => r.provider === "FINNHUB") ? "FINNHUB" : "YAHOO",
    items,
    sectors: [],
    fetchedAt: Date.now(),
  };
}
