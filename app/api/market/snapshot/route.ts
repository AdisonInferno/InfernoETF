export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/market/snapshot?symbols=SMH,VOO,CDR.WA → { snap: { [sym]: { price, chg1d, ytd, currency, asOf } | null } }
   Real "today" numbers from Yahoo daily candles since Jan 1 (one request per symbol):
     price = last close (live during the session), chg1d = vs previous daily close, ytd = vs last close of last year.
   Cached 60 s per symbol, up to 150 symbols per call, 8 requests in parallel. */
const YAHOO = process.env.YAHOO_BASE_URL ?? "https://query1.finance.yahoo.com";
export interface Snap { price: number; chg1d: number; ytd: number | null; currency: string; asOf: number }
const g = globalThis as typeof globalThis & { __infernoSnap?: Map<string, { at: number; s: Snap | null }> };
const cache = (g.__infernoSnap ??= new Map());

async function snap(sym: string): Promise<Snap | null> {
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < 60_000) return hit.s;
  let s: Snap | null = null;
  try {
    const r = await fetch(`${YAHOO}/v8/finance/chart/${encodeURIComponent(sym)}?range=ytd&interval=1d`, {
      headers: { "User-Agent": "Mozilla/5.0 InfernoETF" }, signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const res = (await r.json())?.chart?.result?.[0];
      const m = res?.meta ?? {};
      const t: number[] = res?.timestamp ?? [];
      const c = ((res?.indicators?.quote?.[0]?.close ?? []) as (number | null)[]).map((v, i) => [t[i], v] as const).filter((x): x is readonly [number, number] => typeof x[1] === "number");
      const price = typeof m.regularMarketPrice === "number" ? m.regularMarketPrice : c.at(-1)?.[1];
      // previous session close: the bar before the last one (the last bar is today's / the latest session)
      const prev = c.length >= 2 ? c[c.length - 2][1] : m.chartPreviousClose;
      const yearBase = m.chartPreviousClose; // close of the last session of last year
      if (typeof price === "number" && typeof prev === "number" && prev) {
        let p = price, cur = m.currency ?? "USD";
        const k = cur === "GBp" || cur === "GBX" ? 0.01 : 1; // pence → pounds
        if (k !== 1) cur = "GBP";
        p *= k;
        s = { price: +p.toFixed(4), chg1d: +((price / prev - 1) * 100).toFixed(2), ytd: typeof yearBase === "number" && yearBase ? +((price / yearBase - 1) * 100).toFixed(2) : null, currency: cur, asOf: c.at(-1)?.[0] ?? 0 };
      }
    }
  } catch { /* offline / blocked */ }
  cache.set(sym, { at: Date.now(), s });
  return s;
}

export async function GET(req: Request) {
  const syms = [...new Set((new URL(req.url).searchParams.get("symbols") ?? "").split(",").map((x) => x.trim().toUpperCase())
    .filter((x) => /^[A-Z0-9^][A-Z0-9.^=-]{0,14}$/.test(x)))].slice(0, 150);
  const out: Record<string, Snap | null> = {};
  for (let i = 0; i < syms.length; i += 8) await Promise.all(syms.slice(i, i + 8).map(async (s) => { out[s] = await snap(s); }));
  return Response.json({ snap: out });
}
