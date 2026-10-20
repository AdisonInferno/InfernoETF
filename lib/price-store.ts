/* PRICE STORE — server-side closes for every chart / return calculation.
   Three layers, newest first:
     1. memory (per server process)
     2. disk:  data/price-cache/<range>/<SYM>.json  (survives restarts; `data/` is git-ignored)
     3. Yahoo chart endpoint (no key)
   Freshness: intraday ranges (1d / 5d) 15 min, everything else 3 h — daily closes don't change faster
   than that for long-term analysis. A warmer refreshes the biggest ETFs and their holdings every 3 h, so
   pages read stored data instead of fetching hundreds of symbols on demand. */

import { promises as fs } from "node:fs";
import path from "node:path";

const YAHOO = process.env.YAHOO_BASE_URL ?? "https://query1.finance.yahoo.com";
/** range → bar interval */
export const RANGES: Record<string, string> = { "1d": "5m", "5d": "30m", "1mo": "1d", "3mo": "1d", ytd: "1d", "1y": "1d", "2y": "1d", "5y": "1wk", max: "1mo" };
export type PriceSeries = { t: number[]; c: number[]; o?: number[]; h?: number[]; l?: number[] };

const DIR = path.join(process.cwd(), "data", "price-cache");
const HOUR = 3600_000;
/** refresh interval of the store (and the warmer) */
export const REFRESH_MS = 3 * HOUR;
const ttlOf = (range: string) => (range === "1d" || range === "5d" ? 15 * 60_000 : REFRESH_MS);

type Entry = { at: number; s: PriceSeries | null };
const g = globalThis as typeof globalThis & { __oasisPx?: Map<string, Entry> };
const mem = (g.__oasisPx ??= new Map());

const fileOf = (sym: string, range: string) => path.join(DIR, range, `${sym.replace(/[^A-Z0-9.^=-]/gi, "_")}.json`);

async function readDisk(sym: string, range: string): Promise<Entry | null> {
  try { return JSON.parse(await fs.readFile(fileOf(sym, range), "utf8")) as Entry; } catch { return null; }
}
async function writeDisk(sym: string, range: string, e: Entry) {
  try {
    await fs.mkdir(path.join(DIR, range), { recursive: true });
    await fs.writeFile(fileOf(sym, range), JSON.stringify(e));
  } catch { /* read-only filesystem (serverless) → memory only */ }
}

async function fromYahoo(sym: string, range: string): Promise<PriceSeries | null> {
  try {
    const r = await fetch(`${YAHOO}/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${RANGES[range] ?? "1d"}`, {
      headers: { "User-Agent": "Mozilla/5.0 InfernoETF" }, signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const res = (await r.json())?.chart?.result?.[0];
    const q = res?.indicators?.quote?.[0] ?? {};
    const t: number[] = res?.timestamp ?? [], c: (number | null)[] = q.close ?? [];
    const o: (number | null)[] = q.open ?? [], hi: (number | null)[] = q.high ?? [], lo: (number | null)[] = q.low ?? [];
    const idx = t.map((_, i) => i).filter((i) => typeof c[i] === "number");
    if (idx.length < 2) return null;
    const r4 = (v: number) => +v.toFixed(4);
    const s: PriceSeries = { t: idx.map((i) => t[i]), c: idx.map((i) => r4(c[i]!)) };
    if (idx.every((i) => typeof o[i] === "number" && typeof hi[i] === "number" && typeof lo[i] === "number")) {
      s.o = idx.map((i) => r4(o[i]!)); s.h = idx.map((i) => r4(hi[i]!)); s.l = idx.map((i) => r4(lo[i]!));
    }
    return s;
  } catch { return null; } // offline / blocked
}

/** Closes for one symbol + range, from the freshest layer available. `force` skips the caches (warmer). */
export async function getSeries(sym: string, range: string, force = false): Promise<PriceSeries | null> {
  const key = `${range}:${sym}`, ttl = ttlOf(range), now = Date.now();
  if (!force) {
    const m = mem.get(key);
    if (m && now - m.at < ttl) return m.s;
    const d = await readDisk(sym, range);
    if (d && now - d.at < ttl) { mem.set(key, d); return d.s; }
  }
  const s = await fromYahoo(sym, range);
  // a failed fetch keeps the last good series (stale beats empty) but is retried on the next request
  if (!s) {
    const old = mem.get(key) ?? (await readDisk(sym, range));
    if (old?.s) return old.s;
  }
  const e = { at: now, s };
  mem.set(key, e);
  if (s) await writeDisk(sym, range, e);
  return s;
}

/* ── warmer: every 3 h, the biggest ETFs + their holdings for the ranges the views use ── */

let warmTimer: ReturnType<typeof setInterval> | null = null;
const g2 = globalThis as typeof globalThis & { __oasisWarm?: { last: number; symbols: number; ok: number; ms: number } };
export const warmState = () => g2.__oasisWarm ?? null;

/** symbols to keep warm: the N largest ETFs (by AUM), their tracked holdings, the benchmark */
async function warmUniverse(topEtfs: number): Promise<string[]> {
  const { ETFS } = await import("@/lib/etfs");
  const { PROFILE_OF } = await import("@/lib/fund-profiles");
  const etfs = [...ETFS].sort((a, b) => b.aum - a.aum).slice(0, topEtfs).map((e) => e.ticker);
  const held = etfs.flatMap((t) => (PROFILE_OF[t]?.holdings ?? []).map((l) => l.split("|")[0]).filter((x) => x && !x.endsWith(".")));
  return [...new Set(["SPY", ...etfs, ...held])];
}

export async function warmNow(topEtfs = Number(process.env.PRICE_WARM_TOP ?? 20), ranges = ["2y", "1y", "5y", "3mo", "1mo", "ytd"]) {
  const t0 = Date.now();
  const syms = await warmUniverse(topEtfs);
  let ok = 0;
  const jobs = syms.flatMap((s) => ranges.map((r) => [s, r] as const));
  for (let i = 0; i < jobs.length; i += 4) { // 4 at a time, gentle on the free endpoint
    const got = await Promise.all(jobs.slice(i, i + 4).map(([s, r]) => getSeries(s, r, true)));
    ok += got.filter(Boolean).length;
  }
  g2.__oasisWarm = { last: Date.now(), symbols: syms.length, ok, ms: Date.now() - t0 };
  return g2.__oasisWarm;
}

/** Start the 3-hour refresh (once per server process). Disable with PRICE_WARM=0. */
export function startPriceWarmer() {
  if (warmTimer || process.env.PRICE_WARM === "0") return;
  const run = () => warmNow().catch(() => null);
  setTimeout(run, 90_000); // let the server finish booting first
  warmTimer = setInterval(run, REFRESH_MS);
}
