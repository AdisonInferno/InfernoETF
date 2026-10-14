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

/* ── Market structure (no API key needed): NYSE holidays / early closes, monthly options expiry ── */
const NYSE_CLOSED: [date: string, name: string][] = [
  ["2026-01-01", "New Year's Day"], ["2026-01-19", "Martin Luther King Jr. Day"], ["2026-02-16", "Presidents' Day"],
  ["2026-04-03", "Good Friday"], ["2026-05-25", "Memorial Day"], ["2026-06-19", "Juneteenth"],
  ["2026-07-03", "Independence Day (observed)"], ["2026-09-07", "Labor Day"], ["2026-11-26", "Thanksgiving Day"],
  ["2026-12-25", "Christmas Day"],
];
const NYSE_EARLY: [date: string, name: string][] = [["2026-11-27", "Day after Thanksgiving"], ["2026-12-24", "Christmas Eve"]];

/** Third Friday of a month, "YYYY-MM-DD". */
function thirdFriday(y: number, m0: number): string {
  const first = new Date(Date.UTC(y, m0, 1)).getUTCDay();
  const d = 1 + ((5 - first + 7) % 7) + 14;
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function marketEvents(fromDay: string, toDay: string): CalEvent[] {
  const out: CalEvent[] = [];
  for (const [d, name] of NYSE_CLOSED) out.push({ source: "MKT", code: "CLOSED", at: `${d}T12:00:00.000Z`, title: `NYSE & Nasdaq closed · ${name}`, allDay: true });
  for (const [d, name] of NYSE_EARLY) out.push({ source: "MKT", code: "EARLY", at: nyToUtc(d, "13:00"), title: `Early close 13:00 ET · ${name}` });
  const [fy, fm] = fromDay.split("-").map(Number), [ty, tm] = toDay.split("-").map(Number);
  for (let y = fy, m = fm - 1; y < ty || (y === ty && m <= tm - 1); m === 11 ? (y++, (m = 0)) : m++) {
    let d = thirdFriday(y, m);
    const quad = m % 3 === 2;
    if (NYSE_CLOSED.some(([c]) => c === d)) d = day(new Date(Date.parse(`${d}T12:00:00Z`) - 86400_000)); // expiry moves to Thursday
    out.push({ source: "MKT", code: quad ? "QUAD" : "OPEX", at: nyToUtc(d, "16:00"), title: quad ? "Quad witching · stock & index options + futures expire" : "Monthly options expiration" });
  }
  return out.filter((e) => { const d = e.at.slice(0, 10); return d >= fromDay && d <= toDay; });
}

/** Every event in one calendar month ("YYYY-MM"): FOMC, market structure, FRED releases, earnings of tracked tickers. */
export async function monthEvents(month: string, tickers: string[]): Promise<{ events: CalEvent[]; missing: string[] }> {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`, to = day(new Date(Date.UTC(y, m, 0)));
  // one day of slack on each side so time zones east/west of UTC still see edge-of-month events
  const lo = day(new Date(Date.parse(`${from}T00:00:00Z`) - 86400_000)), hi = day(new Date(Date.parse(`${to}T00:00:00Z`) + 86400_000));
  const missing = [!process.env.FRED_API_KEY && "FRED_API_KEY", !process.env.FINNHUB_API_KEY && "FINNHUB_API_KEY"].filter(Boolean) as string[];
  const [fr, er] = await Promise.allSettled([
    cached(`fred:${lo}`, () => fred(lo)),
    cached(`earn:${lo}:${hi}:${tickers.length}`, () => earnings(lo, hi, new Set(tickers))),
  ]);
  const events = [...fomc(), ...marketEvents(lo, hi), ...(fr.status === "fulfilled" ? fr.value : []), ...(er.status === "fulfilled" ? er.value : [])]
    .filter((e) => { const d = e.at.slice(0, 10); return d >= lo && d <= hi; })
    .sort((a, b) => a.at.localeCompare(b.at));
  return { events, missing };
}

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
