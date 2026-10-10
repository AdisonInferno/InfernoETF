/* Server-only jobs that fill the archive.
 *
 *   collectNow()      latest news: Finnhub general + company (last 3 days) + Yahoo, for the universe
 *   startBackfill(n)  walks Finnhub company news back n days in 30-day windows, resumable
 *   startScheduler()  runs collectNow() shortly after the server starts, then every hour
 *
 * One job at a time. State lives on globalThis so dev hot-reloads don't start duplicates. */

import { promises as fs } from "node:fs";
import path from "node:path";
import { ARCHIVE_DIR, saveArticles, type ArchivedArticle } from "./store";
import { finnhubCompany, finnhubGeneral, hasFinnhub, newsUniverse, yahooLatest } from "./sources";

export interface JobState {
  kind: "collect" | "backfill" | null;
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  done: number;
  total: number;
  added: number;
  errors: number;
  log: string[];
  lastCollectAt: number | null;
  nextCollectAt: number | null;
}

type G = typeof globalThis & { __infernoNews?: { state: JobState; timer?: ReturnType<typeof setInterval>; kick?: ReturnType<typeof setTimeout> } };
const g = globalThis as G;
g.__infernoNews ??= {
  state: { kind: null, running: false, startedAt: null, finishedAt: null, done: 0, total: 0, added: 0, errors: 0, log: [], lastCollectAt: null, nextCollectAt: null },
};
const S = () => g.__infernoNews!.state;

export const jobState = (): JobState => ({ ...S(), log: S().log.slice(-40) });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);
const FINNHUB_GAP_MS = 1100; // stay under ~55 calls/min on the free tier
const HOUR_MS = 60 * 60 * 1000;

function log(msg: string) {
  const s = S();
  s.log.push(`${new Date().toISOString().slice(11, 19)}  ${msg}`);
  if (s.log.length > 200) s.log.splice(0, s.log.length - 200);
}

function begin(kind: "collect" | "backfill", total: number) {
  Object.assign(S(), { kind, running: true, startedAt: now(), finishedAt: null, done: 0, total, added: 0, errors: 0 });
}
function end() {
  const s = S();
  s.running = false;
  s.finishedAt = now();
  log(`${s.kind?.toUpperCase()} finished · +${s.added} new · ${s.errors} errors`);
}

/** Run one provider call with a single retry after a rate-limit pause. */
async function step(label: string, fn: () => Promise<ArchivedArticle[]>) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { added } = await saveArticles(await fn());
      S().added += added;
      if (added) log(`${label}: +${added}`);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "RATE_LIMIT" && attempt === 0) { log(`${label}: rate limited, waiting 60s`); await sleep(60_000); continue; }
      S().errors++;
      log(`${label}: ${msg}`);
      return;
    }
  }
}

/* ── Latest news ── */

export async function collectNow(): Promise<boolean> {
  if (S().running) return false;
  const tickers = newsUniverse();
  const finn = hasFinnhub();
  begin("collect", (finn ? 1 + tickers.length : 0) + tickers.length);
  log(`COLLECT started · ${tickers.length} tickers · Finnhub ${finn ? "on" : "off (no FINNHUB_API_KEY)"}`);
  try {
    if (finn) {
      await step("finnhub general", finnhubGeneral); S().done++;
      const to = new Date(), from = new Date(Date.now() - 3 * 86400_000);
      for (const t of tickers) {
        await step(`finnhub ${t}`, () => finnhubCompany(t, from, to)); S().done++;
        await sleep(FINNHUB_GAP_MS);
      }
    }
    for (const t of tickers) {
      await step(`yahoo ${t}`, () => yahooLatest(t)); S().done++;
      await sleep(250);
    }
  } finally {
    S().lastCollectAt = now();
    end();
  }
  return true;
}

/* ── History backfill (resumable) ── */

const PROGRESS_FILE = path.join(ARCHIVE_DIR, "_backfill.json");
/** ticker → oldest day (YYYY-MM-DD) already fetched */
async function readProgress(): Promise<Record<string, string>> {
  try { return JSON.parse(await fs.readFile(PROGRESS_FILE, "utf8")); } catch { return {}; }
}
async function writeProgress(p: Record<string, string>) {
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(p, null, 1));
}

export function startBackfill(days: number): { started: boolean; reason?: string } {
  if (S().running) return { started: false, reason: "A job is already running" };
  if (!hasFinnhub()) return { started: false, reason: "FINNHUB_API_KEY missing in .env.local" };
  void runBackfill(Math.max(7, Math.min(365, Math.round(days))));
  return { started: true };
}

async function runBackfill(days: number) {
  const tickers = newsUniverse();
  const WINDOW = 30;
  const windows = Math.ceil(days / WINDOW);
  const progress = await readProgress();
  const limit = Date.now() - days * 86400_000;
  begin("backfill", tickers.length * windows);
  log(`BACKFILL started · ${days} days · ${tickers.length} tickers · ${windows} windows each`);
  try {
    for (const t of tickers) {
      // Resume: start below the oldest day already fetched for this ticker.
      let to = progress[t] ? new Date(Date.parse(progress[t]) - 86400_000) : new Date();
      for (let w = 0; w < windows; w++) {
        if (to.getTime() <= limit) { S().done++; continue; }
        const from = new Date(Math.max(limit, to.getTime() - (WINDOW - 1) * 86400_000));
        const f = new Date(from), tt = new Date(to);
        await step(`backfill ${t} ${f.toISOString().slice(0, 10)}→${tt.toISOString().slice(0, 10)}`, () => finnhubCompany(t, f, tt));
        progress[t] = from.toISOString().slice(0, 10);
        await writeProgress(progress);
        S().done++;
        to = new Date(from.getTime() - 86400_000);
        await sleep(FINNHUB_GAP_MS);
      }
    }
  } finally {
    end();
  }
}

/* ── Hourly scheduler (called from instrumentation.ts) ── */

export function startScheduler() {
  const box = g.__infernoNews!;
  if (box.timer || process.env.NEWS_ARCHIVE_DISABLED === "1") return;
  const tick = () => { S().nextCollectAt = now() + HOUR_MS / 1000; void collectNow(); };
  box.kick = setTimeout(tick, 30_000); // first run 30 s after start
  box.timer = setInterval(tick, HOUR_MS);
  S().nextCollectAt = now() + 30;
  log("SCHEDULER on · first collect in 30s, then hourly");
}
