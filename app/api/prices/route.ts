export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/prices?symbols=NVDA,SMH&range=1mo → { series: { [sym]: { t: number[] (unix s), c: number[] } } }
   Daily closes from Yahoo's public chart endpoint (no key). Cached 15 min per symbol+range. */
const YAHOO = process.env.YAHOO_BASE_URL ?? "https://query1.finance.yahoo.com";
/** range → bar interval */
const RANGES: Record<string, string> = { "1d": "5m", "5d": "30m", "1mo": "1d", "3mo": "1d", ytd: "1d", "1y": "1d", "5y": "1wk", max: "1mo" };
type S = { t: number[]; c: number[] };
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
      const t: number[] = res?.timestamp ?? [], c: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
      const pts = t.map((ts, i) => [ts, c[i]] as const).filter((p): p is readonly [number, number] => typeof p[1] === "number");
      if (pts.length > 1) s = { t: pts.map((p) => p[0]), c: pts.map((p) => +p[1].toFixed(4)) };
    }
  } catch { /* offline / blocked → null */ }
  cache.set(k, { at: Date.now(), s });
  return s;
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const range = (p.get("range") ?? "") in RANGES ? p.get("range")! : "1mo";
  const syms = (p.get("symbols") ?? "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z][A-Z0-9.^=-]{0,9}$/.test(x)).slice(0, 6);
  const out: Record<string, S | null> = {};
  await Promise.all(syms.map(async (s) => { out[s] = await series(s, range); }));
  return Response.json({ series: out });
}
