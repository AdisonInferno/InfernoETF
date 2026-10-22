/* Server-only: AI-ready market context.
 *
 * Turns the cleaned news archive into compact, scored market events and keeps a copy on disk
 * (data/market-context.json — plain JSON an LLM agent or script can read directly).
 *
 *   record = { id, timestamp_utc, timeframe, headline, summary, source, url, affected_tickers,
 *              macro_category, impact_score (−1 bearish … +1 bullish), volatility_flag }
 *
 *   · dedupe      same story from several providers / re-posts → one record (normalised-headline hash)
 *   · noise       promo / clickbait already dropped by the archive quality pass (quality === "low")
 *   · category    MONETARY · GEOPOLITICS · COMMODITIES · EARNINGS · MACRO (keyword rules, transparent)
 *   · impact      direction from the headline tone lexicon × magnitude from event words, mega-caps,
 *                 multi-source coverage, macro relevance and tier-1 source
 *   · fallback    archive empty (first start / no FINNHUB_API_KEY / provider throttled) → curated
 *                 SAMPLE events, flagged `sample: true` so the UI never passes them off as live news.
 *
 * getMarketContextForAI() formats the events as a short markdown block to ground LLM calls. */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { queryArchive } from "./store";
import type { CleanArticle } from "./quality";
import { score as toneOf } from "@/lib/intel/sentiment";

export type Timeframe = "DAILY" | "WEEKLY" | "MONTHLY";
export type MacroCategory = "MONETARY" | "GEOPOLITICS" | "COMMODITIES" | "EARNINGS" | "MACRO";
export interface MarketEvent {
  id: string;
  timestamp_utc: string;
  timeframe: Timeframe;
  headline: string;
  summary: string;
  source: string;
  url: string;
  affected_tickers: string[];
  /** industry sub-sectors the story is about (e.g. "Semiconductors") — lets an agent pull one ETF's sector news */
  sub_sectors: string[];
  macro_category: MacroCategory;
  impact_score: number;
  volatility_flag: "HIGH" | "MEDIUM" | "LOW";
  /** raw magnitude points behind the score (for ranking / debugging) */
  magnitude: number;
  /** true = curated example, not live news */
  sample?: boolean;
  /** archive article id (AI insight cache key) */
  ref?: string;
}

const FILE = path.join(process.cwd(), "data", "market-context.json");
const DAYS: Record<Timeframe, number> = { DAILY: 1, WEEKLY: 7, MONTHLY: 30 };

/* ── classification ── */
const CAT: [MacroCategory, RegExp][] = [
  ["MONETARY", /\b(fed|fomc|powell|ecb|lagarde|boj|bank of (england|japan)|central bank|rate (cut|hike)s?|interest rates?|yields?|treasur(y|ies)|bond market|inflation|cpi|ppi|pce|monetary)\b/i],
  ["GEOPOLITICS", /\b(war|military|missile|invasion|sanctions?|tariffs?|trade war|export controls?|election|ukraine|russia|israel|iran|taiwan|middle east|nato|geopolitic\w*|ceasefire|coup)\b/i],
  ["COMMODITIES", /\b(oil|crude|brent|wti|opec|natural gas|lng|gold|silver|copper|lithium|uranium|wheat|corn|commodit\w+|iron ore|nickel)\b/i],
  ["EARNINGS", /\b(earnings|quarterly results|results|revenue|eps|profit|guidance|outlook|forecast|beats?|miss(es|ed)?|sales)\b/i],
];
const category = (text: string): MacroCategory => CAT.find(([, re]) => re.test(text))?.[0] ?? "MACRO";

const EVENT = /\b(fed|fomc|powell|rate (cut|hike)s?|interest rates?|inflation|cpi|ppi|payrolls?|jobs report|unemployment|gdp|recession|tariffs?|sanctions?|opec|earnings|results|guidance|forecast|outlook|beats?|miss(es|ed)?|revenue|profit warning|acquisitions?|acquires?|merger|buyout|takeover|deal|bankrupt\w*|default|lawsuit|probe|investigation|antitrust|downgrades?|upgrades?|layoffs?|job cuts|recall|record high|all-time high|plunges?|soars?|surges?|tumbles?|crash\w*|sell-?off|rall(y|ies)|war|strike|halt\w*|ipo|split|buyback|dividend)\b/gi;
const MEGA = new Set(["AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "AVGO", "BRK.B", "JPM", "LLY", "V", "MA", "XOM", "UNH", "TSM", "ORCL", "WMT", "NFLX", "AMD", "PLTR"]);
const TIER1 = /reuters|bloomberg|wall street journal|wsj|financial times|\bft\b|cnbc|barron|marketwatch|associated press|\bap\b/i;

/** magnitude points (0 … ~11) — how market-moving the story is, regardless of direction */
export function magnitudeOf(a: CleanArticle, tone: number): number {
  const hits = new Set((a.headline.match(EVENT) ?? []).map((w) => w.toLowerCase())).size;
  let pts = hits ? Math.min(3, 1 + hits) : 0;
  pts += Math.min(2, Math.abs(tone) * 2);
  pts += Math.min(2, a.relevant.filter((t) => MEGA.has(t)).length);
  pts += Math.min(2, a.dupes ?? 0);
  if (a.kind === "macro") pts += 1;
  if (TIER1.test(a.source)) pts += 1;
  return pts;
}
export const levelOf = (pts: number): 1 | 2 | 3 => (pts >= 5 ? 3 : pts >= 2.5 ? 2 : 1);

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const hashOf = (h: string) => createHash("sha1").update(norm(h)).digest("hex").slice(0, 16);

function timeframeOf(ts: number, now: number): Timeframe {
  const age = now - ts;
  return age <= 86400 ? "DAILY" : age <= 7 * 86400 ? "WEEKLY" : "MONTHLY";
}

function toEvent(a: CleanArticle, now: number): MarketEvent {
  const tone = toneOf(a);
  const pts = magnitudeOf(a, tone);
  const lvl = levelOf(pts);
  const strength = Math.min(0.9, 0.2 + pts / 14); // headline tone alone never reaches ±1
  const impact = Math.max(-1, Math.min(1, tone * strength));
  return {
    id: hashOf(a.headline),
    timestamp_utc: new Date(a.ts * 1000).toISOString(),
    timeframe: timeframeOf(a.ts, now),
    headline: a.headline,
    summary: (a.summary ?? "").slice(0, 400),
    source: a.source,
    url: a.url,
    affected_tickers: a.relevant.slice(0, 6),
    sub_sectors: a.subs.slice(0, 4),
    macro_category: category(`${a.headline} ${a.summary ?? ""}`),
    impact_score: Math.round(impact * 100) / 100,
    volatility_flag: lvl === 3 ? "HIGH" : lvl === 2 ? "MEDIUM" : "LOW",
    magnitude: Math.round(pts * 10) / 10,
    ref: a.id,
  };
}

/* ── curated fallback (clearly flagged as samples) ── */
function samples(now: number): MarketEvent[] {
  const ago = (h: number) => new Date((now - h * 3600) * 1000).toISOString();
  const s = (o: Omit<MarketEvent, "id" | "timeframe" | "sample" | "url" | "summary" | "sub_sectors"> & { summary?: string }): MarketEvent => {
    const ts = Date.parse(o.timestamp_utc) / 1000;
    return { ...o, sub_sectors: [], summary: o.summary ?? "", url: "", id: "sample-" + hashOf(o.headline), timeframe: timeframeOf(ts, now), sample: true };
  };
  return [
    s({ timestamp_utc: ago(2), headline: "SAMPLE · Fed officials signal patience on further rate cuts as core inflation stays sticky", source: "Sample", affected_tickers: ["TLT", "SPY", "UUP"], macro_category: "MONETARY", impact_score: -0.42, volatility_flag: "HIGH", magnitude: 6 }),
    s({ timestamp_utc: ago(5), headline: "SAMPLE · Brent jumps as OPEC+ extends output cuts into next quarter", source: "Sample", affected_tickers: ["USO", "XLE", "XOM"], macro_category: "COMMODITIES", impact_score: 0.38, volatility_flag: "HIGH", magnitude: 5.5 }),
    s({ timestamp_utc: ago(9), headline: "SAMPLE · Mega-cap chipmaker beats revenue estimates on data-center demand", source: "Sample", affected_tickers: ["NVDA", "SMH", "SOXX"], macro_category: "EARNINGS", impact_score: 0.55, volatility_flag: "HIGH", magnitude: 7 }),
    s({ timestamp_utc: ago(30), headline: "SAMPLE · New export controls on advanced semiconductors weigh on Asian suppliers", source: "Sample", affected_tickers: ["TSM", "ASML", "SOXX"], macro_category: "GEOPOLITICS", impact_score: -0.35, volatility_flag: "MEDIUM", magnitude: 4.5 }),
    s({ timestamp_utc: ago(80), headline: "SAMPLE · Payrolls come in near consensus; unemployment rate unchanged", source: "Sample", affected_tickers: ["SPY", "IWM"], macro_category: "MACRO", impact_score: 0.08, volatility_flag: "MEDIUM", magnitude: 3 }),
    s({ timestamp_utc: ago(220), headline: "SAMPLE · Gold hits record as central-bank buying continues", source: "Sample", affected_tickers: ["GLD", "GDX"], macro_category: "COMMODITIES", impact_score: 0.3, volatility_flag: "MEDIUM", magnitude: 4 }),
  ];
}

/* ── build + cache ── */
const g = globalThis as typeof globalThis & { __oasisCtx?: { at: number; events: MarketEvent[]; live: boolean } };

/** All events of the last 30 days, deduplicated, newest first. Rebuilt at most every 2 minutes; persisted to data/market-context.json. */
export async function marketContext(): Promise<{ events: MarketEvent[]; live: boolean }> {
  const hit = g.__oasisCtx;
  if (hit && Date.now() - hit.at < (hit.live ? 120_000 : 15_000)) return hit; // samples: re-check soon for freshly collected news
  const now = Math.floor(Date.now() / 1000);
  const arts = await queryArchive({ from: now - 30 * 86400, limit: 5000 });
  const seen = new Set<string>();
  const events: MarketEvent[] = [];
  for (const a of arts) {
    const e = toEvent(a, now);
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    events.push(e);
  }
  const live = events.length > 0;
  const out = { at: Date.now(), events: live ? events : samples(now), live };
  g.__oasisCtx = out;
  if (live) {
    fs.mkdir(path.dirname(FILE), { recursive: true })
      .then(() => fs.writeFile(FILE, JSON.stringify({ generated_utc: new Date().toISOString(), count: events.length, events }, null, 1), "utf8"))
      .catch(() => { /* read-only disk: the in-memory copy still works */ });
  }
  return out;
}

export interface ContextQuery { timeframe?: Timeframe; ticker?: string; subSector?: string; minImpact?: number; category?: MacroCategory; limit?: number; order?: "impact" | "newest" }

/** Filtered events: timeframe = window (DAILY ≤ 1 day, WEEKLY ≤ 7, MONTHLY ≤ 30), |impact| ≥ minImpact. */
export async function getMarketContext(q: ContextQuery = {}): Promise<{ events: MarketEvent[]; live: boolean }> {
  const { events, live } = await marketContext();
  const now = Date.now();
  const days = DAYS[q.timeframe ?? "MONTHLY"];
  const t = q.ticker?.toUpperCase();
  let list = events.filter((e) => now - Date.parse(e.timestamp_utc) <= days * 864e5
    && (!t || e.affected_tickers.includes(t))
    && (!q.subSector || e.sub_sectors.some((x) => x.toLowerCase() === q.subSector!.toLowerCase()))
    && (q.minImpact == null || Math.abs(e.impact_score) >= q.minImpact)
    && (!q.category || e.macro_category === q.category));
  // thin DAILY window (weekend, fresh install) → widen to 3 days rather than show an empty feed
  if (q.timeframe === "DAILY" && list.length < 6 && !t) list = events.filter((e) => now - Date.parse(e.timestamp_utc) <= 3 * 864e5);
  list = q.order === "newest"
    ? [...list].sort((a, b) => b.timestamp_utc.localeCompare(a.timestamp_utc))
    : [...list].sort((a, b) => b.magnitude - a.magnitude || b.timestamp_utc.localeCompare(a.timestamp_utc));
  return { events: list.slice(0, q.limit ?? 40), live };
}

/** Compact markdown block for LLM grounding: one line per event, strongest first. */
export async function getMarketContextForAI(q: ContextQuery = {}): Promise<string> {
  const { events, live } = await getMarketContext({ limit: 25, ...q });
  const head = `### MARKET CONTEXT · ${q.timeframe ?? "MONTHLY"}${q.ticker ? ` · ${q.ticker.toUpperCase()}` : ""}${live ? "" : " · SAMPLE DATA (no live news archive yet)"}\n` +
    `impact −1 bearish … +1 bullish · vol = expected volatility\n`;
  if (!events.length) return head + "(no events)";
  return head + events.map((e) =>
    `- ${e.timestamp_utc.slice(0, 16).replace("T", " ")}Z [${e.macro_category}] ${e.impact_score >= 0 ? "+" : ""}${e.impact_score.toFixed(2)} vol:${e.volatility_flag}` +
    `${e.affected_tickers.length ? ` (${e.affected_tickers.join(",")})` : ""} ${e.headline} — ${e.source}`).join("\n");
}
