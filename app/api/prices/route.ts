export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/prices?symbols=NVDA,SMH&range=1mo → { series: { [sym]: { t: number[] (unix s), c: number[] } } }
   Daily closes from Yahoo's public chart endpoint (no key). Cached 15 min per symbol+range. */
const YAHOO = process.env.YAHOO_BASE_URL ?? "https://query1.finance.yahoo.com";
/** range → bar interval */
const RANGES: Record<string, string> = { "1d": "5m", "5d": "30m", "1mo": "1d", "3mo": "1d", ytd: "1d", "1y": "1d", "2y": "1d", "5y": "1wk", max: "1mo" };
type S = { t: number[]; c: number[]; o?: number[]; h?: number[]; l?: number[] };
const g = globalThis as typeof globalThis & { __infernoPx?: Map<string, { at: number; s: S | null }> };
const cache = (g.__infernoPx ??= new Map());

async function series(sym: string, range: string): Promise<S | null> {
  const k = `${sym}:${range}`, hit = cache.get(k);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.s;
  let s: S | null = null;
  try {
    const interval = RANGES[range] ?? "1d";
    const r = await fetch(`${YAHOO}/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`, {
      headers: { "User-Agent": "Mozilla/5.0 InfernoETF" }, signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      const q = res?.indicators?.quote?.[0] ?? {};
      const t: number[] = res?.timestamp ?? [], c: (number | null)[] = q.close ?? [];
      const o: (number | null)[] = q.open ?? [], hi: (number | null)[] = q.high ?? [], lo: (number | null)[] = q.low ?? [];
      const idx = t.map((_, i) => i).filter((i) => typeof c[i] === "number");
      if (idx.length > 1) {
        const r4 = (v: number) => +v.toFixed(4);
        const ohlc = idx.every((i) => typeof o[i] === "number" && typeof hi[i] === "number" && typeof lo[i] === "number");
        s = { t: idx.map((i) => t[i]), c: idx.map((i) => r4(c[i]!)) };
        if (ohlc) { s.o = idx.map((i) => r4(o[i]!)); s.h = idx.map((i) => r4(hi[i]!)); s.l = idx.map((i) => r4(lo[i]!)); }
      }
    }
  } catch { /* offline / blocked → null */ }
  cache.set(k, { at: Date.now(), s });
  return s;
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const range = (p.get("range") ?? "") in RANGES ? p.get("range")! : "1mo";
  const syms = (p.get("symbols") ?? "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z][A-Z0-9.^=-]{0,9}$/.test(x)).slice(0, 20);
  const out: Record<string, S | null> = {};
  await Promise.all(syms.map(async (s) => { out[s] = await series(s, range); }));
  return Response.json({ series: out });
}
