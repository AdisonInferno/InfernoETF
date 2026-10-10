/* Server-only append-only news archive.
 *
 * Layout:  <project>/data/news-archive/YYYY-MM.jsonl  — one JSON article per line, by publish month.
 * Every article has a stable `id` (provider + provider id / url hash); duplicates are skipped,
 * so collectors can safely re-fetch overlapping windows.
 *
 * Plain files on purpose: zero dependencies, survives restarts, easy to inspect, and trivially
 * importable into a real database (SQLite / Postgres / Supabase) later. */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const ARCHIVE_DIR = path.join(process.cwd(), "data", "news-archive");

export type Provider = "finnhub" | "yahoo";

export interface ArchivedArticle {
  id: string;
  provider: Provider;
  /** Publish time, unix seconds */
  ts: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  /** Tickers the article was fetched for / is tagged with */
  tickers: string[];
  /** Provider category, e.g. "general", "company" */
  category: string;
  /** When we stored it, unix seconds */
  collectedAt: number;
}

export const articleId = (provider: Provider, key: string | number) =>
  `${provider}:${createHash("sha1").update(String(key)).digest("hex").slice(0, 16)}`;

const monthKey = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 7); // YYYY-MM

/* ── In-memory index of known ids (built lazily from disk once per server process) ── */
let known: Map<string, ArchivedArticle> | null = null;
let loading: Promise<Map<string, ArchivedArticle>> | null = null;

async function loadIndex(): Promise<Map<string, ArchivedArticle>> {
  if (known) return known;
  loading ??= (async () => {
    const map = new Map<string, ArchivedArticle>();
    await fs.mkdir(ARCHIVE_DIR, { recursive: true });
    for (const f of (await fs.readdir(ARCHIVE_DIR)).filter((n) => n.endsWith(".jsonl")).sort()) {
      const text = await fs.readFile(path.join(ARCHIVE_DIR, f), "utf8");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const a = JSON.parse(line) as ArchivedArticle;
          const prev = map.get(a.id);
          // Later lines may add tickers to an earlier article — merge them.
          map.set(a.id, prev ? { ...prev, tickers: [...new Set([...prev.tickers, ...a.tickers])] } : a);
        } catch { /* skip a corrupt line rather than lose the file */ }
      }
    }
    known = map;
    return map;
  })();
  return loading;
}

/** Append new articles; returns how many were actually new. Articles already stored but fetched
    for a new ticker get a small "ticker tag" line so the ticker shows up in queries. */
export async function saveArticles(items: ArchivedArticle[]): Promise<{ added: number; tagged: number }> {
  const index = await loadIndex();
  const byFile = new Map<string, string[]>();
  let added = 0, tagged = 0;
  for (const a of items) {
    if (!a.headline || !Number.isFinite(a.ts) || a.ts <= 0) continue;
    const prev = index.get(a.id);
    let line: ArchivedArticle | null = null;
    if (!prev) { line = a; index.set(a.id, a); added++; }
    else {
      const extra = a.tickers.filter((t) => !prev.tickers.includes(t));
      if (extra.length) {
        prev.tickers = [...prev.tickers, ...extra];
        line = { ...prev, tickers: extra };
        tagged++;
      }
    }
    if (line) {
      const file = monthKey(line.ts) + ".jsonl";
      (byFile.get(file) ?? byFile.set(file, []).get(file)!).push(JSON.stringify(line));
    }
  }
  for (const [file, lines] of byFile) await fs.appendFile(path.join(ARCHIVE_DIR, file), lines.join("\n") + "\n", "utf8");
  return { added, tagged };
}

export interface ArchiveQuery { ticker?: string; from?: number; to?: number; q?: string; limit?: number }

export async function queryArchive({ ticker, from, to, q, limit = 100 }: ArchiveQuery = {}): Promise<ArchivedArticle[]> {
  const index = await loadIndex();
  const t = ticker?.toUpperCase(), needle = q?.toLowerCase();
  const out: ArchivedArticle[] = [];
  for (const a of index.values()) {
    if (t && !a.tickers.includes(t)) continue;
    if (from && a.ts < from) continue;
    if (to && a.ts > to) continue;
    if (needle && !(a.headline + " " + a.summary).toLowerCase().includes(needle)) continue;
    out.push(a);
  }
  return out.sort((a, b) => b.ts - a.ts).slice(0, Math.max(1, Math.min(1000, limit)));
}

export async function archiveStats() {
  const index = await loadIndex();
  let oldest = Infinity, newest = 0;
  const perProvider: Record<string, number> = {}, perMonth: Record<string, number> = {}, perTicker: Record<string, number> = {};
  for (const a of index.values()) {
    oldest = Math.min(oldest, a.ts); newest = Math.max(newest, a.ts);
    perProvider[a.provider] = (perProvider[a.provider] ?? 0) + 1;
    const m = monthKey(a.ts); perMonth[m] = (perMonth[m] ?? 0) + 1;
    for (const t of a.tickers) perTicker[t] = (perTicker[t] ?? 0) + 1;
  }
  let bytes = 0;
  try { for (const f of await fs.readdir(ARCHIVE_DIR)) bytes += (await fs.stat(path.join(ARCHIVE_DIR, f))).size; } catch { /* empty */ }
  return {
    total: index.size,
    oldest: Number.isFinite(oldest) ? oldest : null,
    newest: newest || null,
    bytes,
    perProvider,
    perMonth: Object.entries(perMonth).sort((a, b) => a[0].localeCompare(b[0])),
    topTickers: Object.entries(perTicker).sort((a, b) => b[1] - a[1]).slice(0, 20),
  };
}
