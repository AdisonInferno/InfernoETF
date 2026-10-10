/* Server-only: upcoming macro releases + earnings.
 *
 *   FOMC     official 2026 schedule (federalreserve.gov), statement at 14:00 ET on day 2
 *   FRED     release dates for CPI, PPI, jobs, GDP, PCE, retail sales   (FRED_API_KEY, free)
 *   Finnhub  earnings calendar, filtered to our tracked companies        (FINNHUB_API_KEY)
 *
 * All event times are returned as ISO UTC; the UI shows them in the viewer's time zone. */

export interface CalEvent {
  /** Badge source, e.g. "FED", "FRED", "EARN" */
  source: string;
  /** Short code, e.g. "FOMC", "CPI", "NVDA" */
  code: string;
  at: string;          // ISO UTC
  title: string;
  /** true when only the date is known (no time of day) */
  allDay?: boolean;
}

const TTL = 60 * 60_000;
type G = typeof globalThis & { __infernoCal?: Map<string, { at: number; data: CalEvent[] }> };
const g = globalThis as G;
g.__infernoCal ??= new Map();
const cache = g.__infernoCal;

async function cached(key: string, fn: () => Promise<CalEvent[]>) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  return data;
}

/** "2026-10-28" + "14:00" New York time → ISO UTC (handles EST/EDT). */
export function nyToUtc(date: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const guess = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  const nyHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(guess));
  const diff = (h - nyHour + 24) % 24; // hours NY is behind UTC at that instant
  return new Date(guess.getTime() + diff * 3600_000).toISOString();
}

/* ── FOMC (second day of each meeting; 2026 schedule from federalreserve.gov) ── */
const FOMC_2026 = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09"];
const SEP = new Set(["2026-03-18", "2026-06-17", "2026-09-16", "2026-12-09"]);

function fomc(): CalEvent[] {
  return FOMC_2026.map((d) => ({
    source: "FED", code: "FOMC", at: nyToUtc(d, "14:00"),
    title: SEP.has(d) ? "Rate decision + economic projections, press conference" : "Rate decision, press conference",
  }));
}

/* ── FRED release dates ── */
const RELEASES: [id: number, code: string, title: string][] = [
  [10, "CPI", "Consumer prices (CPI)"],
  [46, "PPI", "Producer prices (PPI)"],
  [50, "NFP", "Jobs report — payrolls & unemployment"],
  [53, "GDP", "GDP estimate"],
  [54, "PCE", "Personal income & PCE inflation"],
  [9, "RETAIL", "Retail sales"],
];

async function fred(fromDay: string): Promise<CalEvent[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) return [];
  const base = process.env.FRED_BASE_URL ?? "https://api.stlouisfed.org/fred";
  const lists = await Promise.allSettled(RELEASES.map(async ([id, code, title]) => {
    const url = `${base}/release/dates?release_id=${id}&api_key=${key}&file_type=json&include_release_dates_with_no_data=true&realtime_start=${fromDay}&sort_order=asc&limit=6`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`FRED ${res.status}`);
    const j = await res.json();
    return ((j.release_dates ?? []) as { date: string }[]).map((r) => ({ source: "FRED", code, at: nyToUtc(r.date, "08:30"), title }));
  }));
  return lists.flatMap((l) => (l.status === "fulfilled" ? l.value : []));
}

/* ── Finnhub earnings ── */
interface FinnEarn { date: string; symbol: string; hour?: string; epsEstimate?: number | null; quarter?: number; year?: number }

async function earnings(fromDay: string, toDay: string, tickers: Set<string>): Promise<CalEvent[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  const base = process.env.FINNHUB_BASE_URL ?? "https://finnhub.io/api/v1";
  const res = await fetch(`${base}/calendar/earnings?from=${fromDay}&to=${toDay}&token=${key}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Finnhub ${res.status}`);
  const j = await res.json();
  return ((j.earningsCalendar ?? []) as FinnEarn[])
    .filter((e) => tickers.has(e.symbol))
    .map((e) => {
      const when = e.hour === "bmo" ? "07:00" : e.hour === "amc" ? "16:05" : null;
      const est = e.epsEstimate != null ? ` · EPS est. ${e.epsEstimate.toFixed(2)}` : "";
      const q = e.quarter && e.year ? `Q${e.quarter} ${e.year} results` : "Quarterly results";
      return { source: "EARN", code: e.symbol, at: when ? nyToUtc(e.date, when) : `${e.date}T12:00:00.000Z`, title: `${q}${e.hour === "bmo" ? " · before open" : e.hour === "amc" ? " · after close" : ""}${est}`, allDay: !when };
    });
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function upcoming(tickers: string[], days = 14): Promise<{ events: CalEvent[]; missing: string[] }> {
  const now = new Date();
  const from = day(new Date(now.getTime() - 86400_000)), to = day(new Date(now.getTime() + days * 86400_000));
  const missing = [!process.env.FRED_API_KEY && "FRED_API_KEY", !process.env.FINNHUB_API_KEY && "FINNHUB_API_KEY"].filter(Boolean) as string[];
  const [fr, er] = await Promise.allSettled([
    cached(`fred:${from}`, () => fred(from)),
    cached(`earn:${from}:${tickers.length}`, () => earnings(from, to, new Set(tickers))),
  ]);
  const startCut = now.getTime() - 6 * 3600_000, endCut = now.getTime() + days * 86400_000;
  const events = [...fomc(), ...(fr.status === "fulfilled" ? fr.value : []), ...(er.status === "fulfilled" ? er.value : [])]
    .filter((e) => { const t = Date.parse(e.at); return t >= startCut && t <= endCut; })
    .sort((a, b) => a.at.localeCompare(b.at));
  return { events, missing };
}
