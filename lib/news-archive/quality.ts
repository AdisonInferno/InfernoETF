/* Read-time quality pass over raw archived articles. Nothing on disk is changed —
 * re-tune these rules any time and the whole archive is re-evaluated on the next server start.
 *
 *   1. dedupe     same story from Finnhub + Yahoo (or re-posted) → one article, tickers merged
 *   2. relevance  an article only counts for a ticker if the ticker or the company's name
 *                 actually appears in its headline/summary (providers tag loosely)
 *   3. quality    clickbait / promo headlines and empty articles are flagged "low" */

import { PROFILE_OF } from "@/lib/fund-profiles";
import type { ArchivedArticle } from "./store";
import { classify, type NewsKind } from "./sectors";

export type Quality = "high" | "low";
export interface CleanArticle extends ArchivedArticle {
  /** Tickers the article is genuinely about (subset of the raw tags) */
  relevant: string[];
  quality: Quality;
  /** Why it was marked low (for the UI tooltip) */
  reasons: string[];
  /** Other provider copies merged into this one */
  dupes: number;
  /** company = about tracked companies · sector = industry news · macro = rates/markets · other */
  kind: NewsKind;
  /** Sub-sectors (fund-profiles names) the article belongs to */
  subs: string[];
}

/* ── Company names → aliases ── */

const STRIP = /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|n\.v|nv|se|sa|ag|holdings?|group|class [abc]|cl [abc]|the)\b\.?/gi;
const GENERIC_FIRST = new Set(["american", "applied", "advanced", "general", "first", "united", "international", "national", "global", "bank", "new", "royal", "the", "arthur", "automatic"]);
const MANUAL: Record<string, string[]> = {
  GOOGL: ["alphabet", "google"], GOOG: ["alphabet", "google"], META: ["meta platforms", "meta", "facebook", "instagram"],
  NVDA: ["nvidia"], TSM: ["tsmc", "taiwan semiconductor"], AVGO: ["broadcom"], JPM: ["jpmorgan", "jp morgan"],
  AMD: ["amd", "advanced micro"], BRK: ["berkshire"], "BRK.B": ["berkshire"], MSFT: ["microsoft"], AAPL: ["apple"],
  AMZN: ["amazon", "aws"], TSLA: ["tesla"], LLY: ["eli lilly", "lilly"], XOM: ["exxon"], CVX: ["chevron"],
  UNH: ["unitedhealth"], MA: ["mastercard"], V: ["visa"], PLTR: ["palantir"], MU: ["micron"], ORCL: ["oracle"],
};

const aliases: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const prof of new Set(Object.values(PROFILE_OF))) {
    for (const line of prof.holdings) {
      const [t, name] = line.split("|");
      if (out[t]) continue;
      const clean = name.replace(STRIP, " ").replace(/[.,]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
      const first = clean.split(" ")[0];
      const list = new Set<string>(MANUAL[t] ?? []);
      if (clean.length >= 4) list.add(clean);
      if (first.length >= 4 && !GENERIC_FIRST.has(first)) list.add(first);
      out[t] = [...list];
    }
  }
  for (const [t, a] of Object.entries(MANUAL)) out[t] ??= a;
  return out;
})();

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function mentions(ticker: string, text: string, lower: string): boolean {
  // Ticker as a standalone uppercase token (skip 1-letter tickers like V/C — too ambiguous).
  if (ticker.length >= 2 && new RegExp(`(^|[^A-Z])\\$?${esc(ticker)}([^A-Z]|$)`).test(text)) return true;
  return (aliases[ticker] ?? []).some((a) => new RegExp(`\\b${esc(a)}\\b`, "i").test(lower));
}

/* ── Quality ── */

const LOW_SOURCES = /motley fool|fool\.com|investorplace|24\/7 wall|wallstreetzen|stocknews|insidermonkey|gurufocus|simply wall|tipranks|benzinga insights/i;
const CLICKBAIT: [RegExp, string][] = [
  [/^why\b.*\b(stock|shares)\b/i, "“why … stock …” headline"],
  [/\b(soar|soared|soaring|plunge[sd]?|crash(ed)?|skyrocket(ed)?|rocket(ed)?|flew|tank(ed)?|crushed it|popping|sinking)\b.*\b(today|this week|on (monday|tuesday|wednesday|thursday|friday))\b/i, "price-move recap"],
  [/\b(should you buy|is it time to buy|buy now|stock to buy|stocks to buy|would buy|millionaire|no-brainer|forever|retire|before it'?s too late|next (nvidia|amazon|tesla))\b/i, "promo / opinion"],
  [/^(what is|here'?s|this is|is .* a buy|\d+ (reasons|stocks))/i, "listicle / explainer"],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export function cleanArticles(raw: Iterable<ArchivedArticle>): CleanArticle[] {
  // 1) dedupe on normalised headline (keep the copy with the longest summary)
  const byKey = new Map<string, CleanArticle>();
  for (const a of raw) {
    const key = norm(a.headline);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, { ...a, relevant: [], quality: "high", reasons: [], dupes: 0, kind: "other", subs: [] }); continue; }
    const keep = a.summary.length > prev.summary.length ? { ...prev, ...a } : prev;
    keep.tickers = [...new Set([...prev.tickers, ...a.tickers])];
    keep.ts = Math.min(prev.ts, a.ts);
    keep.dupes = prev.dupes + 1;
    byKey.set(key, keep as CleanArticle);
  }

  // 2) relevance + 3) quality
  const out: CleanArticle[] = [];
  for (const a of byKey.values()) {
    const text = `${a.headline} ${a.summary}`;
    const lower = text.toLowerCase();
    a.relevant = a.tickers.filter((t) => mentions(t, text, lower));
    const c = classify(text, a.relevant);
    a.kind = c.kind;
    a.subs = c.subs;
    const reasons: string[] = [];
    if (LOW_SOURCES.test(a.source)) reasons.push(`low-signal source (${a.source})`);
    for (const [re, why] of CLICKBAIT) if (re.test(a.headline)) { reasons.push(why); break; }
    if (a.summary.trim().length < 40) reasons.push("no summary");
    // Fetched for a company but names none — fine if it is still industry/macro news.
    if (a.category === "company" && a.kind === "other") reasons.push("not about any tracked company");
    // "no summary" alone is tolerated for Finnhub general news; Yahoo items never have one, so a
    // Yahoo headline must also be relevant and non-clickbait to count.
    a.reasons = reasons;
    const hard = reasons.filter((r) => r !== "no summary");
    a.quality = hard.length > 0 ? "low" : "high";
    out.push(a);
  }
  return out;
}
