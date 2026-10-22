/* Server-only: earnings board for the NEWS page.
 *   · Finnhub earnings calendar (past N days + next M days), limited to companies held by ETFs in our database
 *   · each row: company, sector, EPS / revenue actual vs estimate (beat / miss), market impact score
 *   · REPORTED rows also get the stock's price reaction: last close before the release → first close after it
 *     (before-open release → that day's close; after-close release → next day's close). */

import { getSeries } from "@/lib/price-store";
import { SUB_PARENT } from "@/lib/fund-profiles";
import { earningsImpact, trackedTickers } from "./awaited";

export interface EarnRow {
  ticker: string; name: string; sector: string; subSector: string | null;
  date: string; hour: "bmo" | "amc" | "dmh" | ""; quarter: number | null; year: number | null;
  epsActual: number | null; epsEstimate: number | null; revActual: number | null; revEstimate: number | null;
  reported: boolean;
  /** % move of the stock on the release (reported only) */
  reaction: number | null;
  impact: number; capB: number; etfs: string[];
}

interface FinnEarn { date: string; symbol: string; hour?: string; epsActual?: number | null; epsEstimate?: number | null; revenueActual?: number | null; revenueEstimate?: number | null; quarter?: number; year?: number }

const g = globalThis as typeof globalThis & { __oasisEarn?: Map<string, { at: number; v: EarnRow[] }> };
const cache = (g.__oasisEarn ??= new Map());
const day = (d: Date) => d.toISOString().slice(0, 10);

async function reactionOf(ticker: string, date: string, hour: string): Promise<number | null> {
  const s = await getSeries(ticker, "3mo");
  if (!s || s.c.length < 3) return null;
  const days = s.t.map((t) => day(new Date(t * 1000)));
  const i = days.indexOf(date);
  if (i < 0) {
    // release day not in the series (holiday / not traded yet) → first day after it
    const j = days.findIndex((d) => d > date);
    return j > 0 ? (s.c[j] / s.c[j - 1] - 1) * 100 : null;
  }
  if (hour === "amc") return i + 1 < s.c.length ? (s.c[i + 1] / s.c[i] - 1) * 100 : null; // reaction not traded yet
  return i > 0 ? (s.c[i] / s.c[i - 1] - 1) * 100 : null;
}

export async function earningsBoard(back = 14, fwd = 21): Promise<{ rows: EarnRow[]; error?: string }> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { rows: [], error: "FINNHUB_API_KEY missing in .env.local" };
  const ck = `${back}:${fwd}`, hit = cache.get(ck);
  if (hit && Date.now() - hit.at < 30 * 60_000) return { rows: hit.v };
  const now = Date.now();
  const from = day(new Date(now - back * 864e5)), to = day(new Date(now + fwd * 864e5)), today = day(new Date(now));
  const base = process.env.FINNHUB_BASE_URL ?? "https://finnhub.io/api/v1";
  let list: FinnEarn[];
  try {
    const r = await fetch(`${base}/calendar/earnings?from=${from}&to=${to}&token=${key}`, { cache: "no-store" });
    if (!r.ok) return { rows: [], error: `Finnhub ${r.status}` };
    list = (await r.json()).earningsCalendar ?? [];
  } catch (e) { return { rows: [], error: e instanceof Error ? e.message : "Finnhub unavailable" }; }

  const tracked = trackedTickers();
  const rows: EarnRow[] = [];
  for (const e of list) {
    if (!tracked.has(e.symbol)) continue;
    const imp = earningsImpact(e.symbol);
    if (!imp) continue;
    const reported = e.epsActual != null || e.revenueActual != null || e.date < today;
    rows.push({
      ticker: e.symbol, name: imp.name ?? e.symbol,
      sector: (imp.sub && SUB_PARENT[imp.sub]) || imp.sub || "Other", subSector: imp.sub,
      date: e.date, hour: (["bmo", "amc", "dmh"].includes(e.hour ?? "") ? e.hour : "") as EarnRow["hour"],
      quarter: e.quarter ?? null, year: e.year ?? null,
      epsActual: e.epsActual ?? null, epsEstimate: e.epsEstimate ?? null,
      revActual: e.revenueActual ?? null, revEstimate: e.revenueEstimate ?? null,
      reported, reaction: null, impact: imp.score, capB: imp.capB, etfs: imp.etfs,
    });
  }
  // price reaction for the most important reported names (bounded: price store caches the series)
  const rep = rows.filter((r) => r.reported).sort((a, b) => b.impact - a.impact).slice(0, 24);
  await Promise.all(rep.map(async (r) => { r.reaction = await reactionOf(r.ticker, r.date, r.hour).catch(() => null); }));
  cache.set(ck, { at: Date.now(), v: rows });
  return { rows };
}
