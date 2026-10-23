/* Server-only: earnings board for the NEWS page.
 *   · Finnhub earnings calendar (past N days + next M days), limited to companies held by ETFs in our database
 *   · each row: company, sector, EPS / revenue actual vs estimate (beat / miss), market impact score
 *   · REPORTED rows also get the stock's price reaction: last close before the release → first close after it
 *     (before-open release → that day's close; after-close release → next day's close). */

import { promises as fs } from "node:fs";
import path from "node:path";
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
  void saveEarningsFile(rows);
  return { rows };
}

/* ── separate AI file: data/earnings-context.json — structured results only (never mixed with news) ── */
const FILE = path.join(process.cwd(), "data", "earnings-context.json");
const surprise = (a: number | null, e: number | null) => (a != null && e ? Math.round((a / Math.abs(e) - Math.sign(e)) * 1000) / 10 : null);
const verdict = (s: number | null) => (s == null ? null : s > 0.5 ? "BEAT" : s < -0.5 ? "MISS" : "IN LINE");

export function toEarningsRecord(r: EarnRow) {
  const eps = surprise(r.epsActual, r.epsEstimate), rev = surprise(r.revActual, r.revEstimate);
  return {
    ticker: r.ticker, company: r.name, sector: r.sector, sub_sector: r.subSector,
    report_date: r.date, timing: r.hour === "bmo" ? "BEFORE_OPEN" : r.hour === "amc" ? "AFTER_CLOSE" : "UNSPECIFIED",
    fiscal_quarter: r.quarter && r.year ? `Q${r.quarter} ${r.year}` : null,
    status: r.reported ? "REPORTED" : "UPCOMING",
    eps_actual: r.epsActual, eps_estimate: r.epsEstimate, eps_surprise_pct: eps, eps_verdict: verdict(eps),
    revenue_actual: r.revActual, revenue_estimate: r.revEstimate, revenue_surprise_pct: rev, revenue_verdict: verdict(rev),
    stock_reaction_pct: r.reaction == null ? null : Math.round(r.reaction * 100) / 100,
    market_impact: r.impact, market_cap_b: r.capB, etfs_most_exposed: r.etfs,
  };
}

async function saveEarningsFile(rows: EarnRow[]) {
  try {
    const records = rows.map(toEarningsRecord).sort((a, b) => b.market_impact - a.market_impact);
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify({ generated_utc: new Date().toISOString(), kind: "EARNINGS", count: records.length, earnings: records }, null, 1), "utf8");
  } catch { /* read-only disk: in-memory copy still works */ }
}

/** Compact earnings block for LLM grounding — kept apart from the news block. */
export async function getEarningsContextForAI(limit = 20): Promise<string> {
  const { rows, error } = await earningsBoard(14, 21);
  if (!rows.length) return `### EARNINGS · last 14d / next 21d\n(${error ?? "no tracked earnings"})`;
  const rec = rows.map(toEarningsRecord).sort((a, b) => (a.status === b.status ? b.market_impact - a.market_impact : a.status === "REPORTED" ? -1 : 1)).slice(0, limit);
  const f = (v: number | null, money = false) => (v == null ? "n/a" : money ? `$${(v / 1e9).toFixed(2)}B` : `$${v.toFixed(2)}`);
  return "### EARNINGS · last 14d (reported) / next 21d (upcoming)\n" + rec.map((e) => e.status === "REPORTED"
    ? `- ${e.report_date} ${e.ticker} (${e.sector}) REPORTED ${e.fiscal_quarter ?? ""}: EPS ${f(e.eps_actual)} vs ${f(e.eps_estimate)} ${e.eps_verdict ?? ""}; revenue ${f(e.revenue_actual, true)} vs ${f(e.revenue_estimate, true)} ${e.revenue_verdict ?? ""}; stock ${e.stock_reaction_pct == null ? "n/a" : (e.stock_reaction_pct >= 0 ? "+" : "") + e.stock_reaction_pct + "%"}`
    : `- ${e.report_date} ${e.ticker} (${e.sector}) UPCOMING ${e.fiscal_quarter ?? ""}: EPS est ${f(e.eps_estimate)}, revenue est ${f(e.revenue_estimate, true)}`).join("\n");
}
