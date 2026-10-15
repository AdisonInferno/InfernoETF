export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/quotes?symbols=NVDA,ASML → { quotes: { [sym]: Quote | null } }
   Live quote incl. pre-/post-market from Yahoo's chart endpoint (no key). Cached 60 s.
   session: "PRE" | "REG" | "POST" | "CLOSED" — PRE/POST prices are the extended-hours last trade. */
const YAHOO = process.env.YAHOO_BASE_URL ?? "https://query1.finance.yahoo.com";
export interface Quote { price: number; prevClose: number; chg: number; session: "PRE" | "REG" | "POST" | "CLOSED"; currency: string; exchange: string }
const g = globalThis as typeof globalThis & { __infernoQ?: Map<string, { at: number; q: Quote | null }> };
const cache = (g.__infernoQ ??= new Map());

async function quote(sym: string): Promise<Quote | null> {
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < 60_000) return hit.q;
  let q: Quote | null = null;
  try {
    const r = await fetch(`${YAHOO}/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1m&includePrePost=true`, {
      headers: { "User-Agent": "Mozilla/5.0 InfernoETF" }, signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const res = (await r.json())?.chart?.result?.[0];
      const m = res?.meta ?? {};
      const ts: number[] = res?.timestamp ?? [];
      const closes: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
      let lastI = closes.length - 1;
      while (lastI >= 0 && typeof closes[lastI] !== "number") lastI--;
      const lastT = lastI >= 0 ? ts[lastI] : 0, last = lastI >= 0 ? (closes[lastI] as number) : m.regularMarketPrice;
      const tp = m.currentTradingPeriod ?? {};
      const now = Date.now() / 1000;
      const session: Quote["session"] =
        tp.pre && now >= tp.pre.start && now < tp.pre.end ? "PRE"
        : tp.regular && now >= tp.regular.start && now < tp.regular.end ? "REG"
        : tp.post && now >= tp.post.start && now < tp.post.end ? "POST" : "CLOSED";
      const price = session === "REG" ? m.regularMarketPrice ?? last : lastT && last ? last : m.regularMarketPrice;
      const prevClose = session === "PRE" || session === "CLOSED" && lastT > (tp.regular?.end ?? 0) ? m.regularMarketPrice ?? m.chartPreviousClose : m.chartPreviousClose ?? m.previousClose;
      if (typeof price === "number" && typeof prevClose === "number" && prevClose) {
        q = { price, prevClose, chg: ((price - prevClose) / prevClose) * 100, session, currency: m.currency ?? "USD", exchange: m.exchangeName ?? "" };
      }
    }
  } catch { /* offline / blocked */ }
  cache.set(sym, { at: Date.now(), q });
  return q;
}

export async function GET(req: Request) {
  const syms = (new URL(req.url).searchParams.get("symbols") ?? "").split(",").map((x) => x.trim().toUpperCase())
    .filter((x) => /^[A-Z0-9][A-Z0-9.^=-]{0,11}$/.test(x)).slice(0, 12);
  const out: Record<string, Quote | null> = {};
  await Promise.all(syms.map(async (s) => { out[s] = await quote(s); }));
  return Response.json({ quotes: out });
}
