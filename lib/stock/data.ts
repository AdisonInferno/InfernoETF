/* ─────────────────────────────────────────────────────────────
   STOCK DEEP DIVE — server-side data
   · SEC XBRL company facts → quarterly income statement + cash flow (revenue, gross / operating / net income,
     EPS, operating cash flow, capex, free cash flow). Q4 and cash-flow quarters are derived from the
     cumulative (year-to-date / full-year) figures in the 10-Q / 10-K filings.
   · SEC submissions → company name, industry (SIC), earnings-release dates (8-K item 2.02).
   · Finnhub (optional, FINNHUB_API_KEY) → EPS estimate vs actual, profile (market cap, country, web), peers, metrics.
   · Yahoo → price, 52-week range, beta vs SPY (computed from 1Y daily closes).
   Cached in memory (6 h financials, 15 min market data).
   ───────────────────────────────────────────────────────────── */

import { cikMap, sec } from "@/lib/intel/sec";
import { summary, toYahoo } from "@/lib/yahoo";

const DATA = process.env.SEC_DATA_BASE_URL ?? "https://data.sec.gov";
const FINN = process.env.FINNHUB_BASE_URL ?? "https://finnhub.io/api/v1";
const YAHOO = process.env.YAHOO_BASE_URL ?? "https://query1.finance.yahoo.com";

export interface Quarter {
  end: string;            // period end, YYYY-MM-DD
  label: string;          // "Q2 FY26" (company fiscal quarter) or "Q2 2026"
  fy?: number; fp?: string;
  revenue: number | null; grossProfit: number | null; operatingIncome: number | null; netIncome: number | null;
  eps: number | null; ocf: number | null; capex: number | null; fcf: number | null;
}
export interface EarningsRow { period: string; quarter?: number; year?: number; actual: number | null; estimate: number | null; surprise: number | null; surprisePct: number | null }
export interface StockData {
  ticker: string; name: string; cik: number | null;
  industry: string | null; exchange: string | null; country: string | null; web: string | null; logo: string | null;
  price: number | null; currency: string; chg1d: number | null;
  marketCap: number | null; pe: number | null; epsTTM: number | null; revenueTTM: number | null; netIncomeTTM: number | null;
  grossMargin: number | null; netMargin: number | null; dividendYield: number | null; beta: number | null;
  hi52: number | null; lo52: number | null;
  quarters: Quarter[];
  earnings: EarningsRow[];
  earningsDates: string[]; // 8-K item 2.02 acceptance dates (results releases), newest first
  peers: string[];
  /** Yahoo profile / fund data (works for any market, incl. Warsaw and UCITS ETFs) */
  quoteType: string | null; sector: string | null; description: string | null; forwardPe: number | null;
  aum: number | null; ter: number | null; category: string | null; family: string | null;
  fundHoldings: { symbol: string; name: string; w: number }[];
  /** main index of the listing's market (S&P 500 for US, WIG20 for Warsaw, DAX for Xetra …) */
  benchmark: { sym: string; label: string };
  sources: string[];
  missing: string[];
}

type Fact = { start?: string; end: string; val: number; form?: string; fy?: number; fp?: string; filed?: string };
const g = globalThis as typeof globalThis & { __infernoStock?: Map<string, { at: number; d: StockData }> };
const cache = (g.__infernoStock ??= new Map());

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;

/** Quarterly values (keyed by period end) from a list of duration facts — direct 3-month facts, otherwise differences of cumulative ones. */
function quarterly(facts: Fact[]): Map<string, number> {
  const uniq = new Map<string, Fact>();
  for (const f of facts) if (f.start && /^10-[QK]/.test(f.form ?? "10-Q")) {
    const k = `${f.start}|${f.end}`, cur = uniq.get(k);
    if (!cur || (f.filed ?? "") > (cur.filed ?? "")) uniq.set(k, f); // latest filing wins (restatements)
  }
  const q = new Map<string, number>();
  const byStart = new Map<string, Fact[]>();
  for (const f of uniq.values()) {
    const d = days(f.start!, f.end);
    if (d >= 80 && d <= 100) q.set(f.end, f.val);
    if (d >= 80 && d <= 380) (byStart.get(f.start!) ?? byStart.set(f.start!, []).get(f.start!)!).push(f);
  }
  // Q4 = full year − the three reported quarters (10-Ks usually only carry the 12-month figure)
  for (const f of uniq.values()) {
    const d = days(f.start!, f.end);
    if (d < 350 || d > 380 || q.has(f.end)) continue;
    const inside = [...q.entries()].filter(([e]) => e > f.start! && e < f.end && days(f.start!, e) < 300);
    if (inside.length === 3) q.set(f.end, f.val - inside.reduce((a, [, v]) => a + v, 0));
  }
  for (const list of byStart.values()) {
    list.sort((a, b) => a.end.localeCompare(b.end));
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i], gap = days(a.end, b.end);
      if (gap >= 80 && gap <= 100 && !q.has(b.end)) q.set(b.end, b.val - a.val);
    }
  }
  return q;
}

function pick(facts: Record<string, { units: Record<string, Fact[]> }>, names: string[], unit = "USD"): Fact[] {
  // several tags can carry the same line (companies switch tags over the years) → merge, first tag wins per period
  const out: Fact[] = [];
  const seen = new Set<string>();
  for (const n of names) for (const f of facts[n]?.units?.[unit] ?? []) {
    const k = `${f.start}|${f.end}`;
    if (!seen.has(k)) { seen.add(k); out.push(f); }
  }
  return out;
}

async function secFinancials(cik: number): Promise<{ quarters: Quarter[]; name: string | null }> {
  const j = await sec(`${DATA}/api/xbrl/companyfacts/CIK${String(cik).padStart(10, "0")}.json`);
  const F = j?.facts?.["us-gaap"] ?? {};
  const rev = quarterly(pick(F, ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"]));
  const gp = quarterly(pick(F, ["GrossProfit"]));
  const op = quarterly(pick(F, ["OperatingIncomeLoss"]));
  const ni = quarterly(pick(F, ["NetIncomeLoss", "ProfitLoss"]));
  const eps = quarterly(pick(F, ["EarningsPerShareDiluted", "EarningsPerShareBasic"], "USD/shares"));
  const ocf = quarterly(pick(F, ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"]));
  const capex = quarterly(pick(F, ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"]));
  // fiscal labels from the 10-Q/10-K fact that reported each period end
  const fyOf = new Map<string, { fy: number; fp: string }>();
  // (fy/fp describe the FILING, so only trust the first filing that reported the period, and only for matching durations)
  const lab = [...pick(F, ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "NetIncomeLoss", "NetCashProvidedByUsedInOperatingActivities"])]
    .filter((f) => f.start && f.fy && f.fp && f.form?.startsWith("10-")).sort((a, b) => (a.filed ?? "").localeCompare(b.filed ?? ""));
  for (const f of lab) {
    const d = days(f.start!, f.end);
    const ok = f.fp === "FY" ? d >= 350 && d <= 380 : /^Q[1-3]$/.test(f.fp!) && d >= 80;
    if (ok && !fyOf.has(f.end)) fyOf.set(f.end, { fy: f.fy!, fp: f.fp! });
  }
  const ends = [...new Set([...rev.keys(), ...ni.keys()])].sort();
  const quarters = ends.map((end) => {
    const v = (m: Map<string, number>) => m.get(end) ?? null;
    const o = v(ocf), c = v(capex);
    const d = new Date(end), fq = fyOf.get(end);
    return {
      // company fiscal quarter when the filing says so (e.g. "Q4 FY25"), else the calendar quarter of the period end
      end, label: fq ? `${fq.fp === "FY" ? "Q4" : fq.fp} FY${String(fq.fy).slice(-2)}` : `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`,
      fy: fq?.fy, fp: fq?.fp,
      revenue: v(rev), grossProfit: v(gp), operatingIncome: v(op), netIncome: v(ni), eps: v(eps) != null ? Math.round(v(eps)! * 100) / 100 : null, ocf: o, capex: c,
      fcf: o != null && c != null ? o - c : null,
    } as Quarter;
  }).filter((q) => q.revenue != null || q.netIncome != null).slice(-20);
  return { quarters, name: j?.entityName ?? null };
}

async function secProfile(cik: number) {
  const j = await sec(`${DATA}/submissions/CIK${String(cik).padStart(10, "0")}.json`);
  const r = j?.filings?.recent;
  const dates: string[] = [];
  for (let i = 0; r && i < r.form.length && dates.length < 12; i++) {
    if (r.form[i] === "8-K" && String(r.items?.[i] ?? "").includes("2.02")) dates.push(String(r.acceptanceDateTime?.[i] || r.filingDate[i]).slice(0, 10));
  }
  return { industry: j?.sicDescription ?? null, exchange: j?.exchanges?.[0] ?? null, web: j?.website || null, name: j?.name ?? null, earningsDates: dates };
}

async function finn<T>(path: string): Promise<T | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`${FINN}${path}${path.includes("?") ? "&" : "?"}token=${key}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

async function yahooDaily(sym: string, range = "1y") {
  try {
    const r = await fetch(`${YAHOO}/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0 InfernoETF" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const res = (await r.json())?.chart?.result?.[0];
    const t: number[] = res?.timestamp ?? [], c: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    const pts = t.map((x, i) => [x, c[i]] as const).filter((p): p is readonly [number, number] => typeof p[1] === "number");
    return { t: pts.map((p) => p[0]), c: pts.map((p) => p[1]), price: res?.meta?.regularMarketPrice as number | undefined, currency: (res?.meta?.currency as string) ?? "USD" };
  } catch { return null; }
}

/** The main index of the market a symbol trades on (Yahoo suffix → index). */
export function benchmarkOf(ysym: string): { sym: string; label: string } {
  const sfx = (/\.([A-Z]{1,2})$/.exec(ysym.toUpperCase()) ?? [])[1] ?? "";
  const M: Record<string, { sym: string; label: string }> = {
    WA: { sym: "WIG20.WA", label: "WIG20" }, DE: { sym: "^GDAXI", label: "DAX" }, F: { sym: "^GDAXI", label: "DAX" }, L: { sym: "^FTSE", label: "FTSE 100" },
    PA: { sym: "^FCHI", label: "CAC 40" }, AS: { sym: "^AEX", label: "AEX" }, MI: { sym: "FTSEMIB.MI", label: "FTSE MIB" }, MC: { sym: "^IBEX", label: "IBEX 35" },
    SW: { sym: "^SSMI", label: "SMI" }, T: { sym: "^N225", label: "NIKKEI 225" }, HK: { sym: "^HSI", label: "HANG SENG" }, TO: { sym: "^GSPTSE", label: "TSX" },
    AX: { sym: "^AXJO", label: "ASX 200" }, ST: { sym: "^OMX", label: "OMX 30" }, CO: { sym: "^OMXC25", label: "OMXC25" }, OL: { sym: "OBX.OL", label: "OBX" },
  };
  return M[sfx] ?? { sym: "SPY", label: "S&P 500" };
}

export async function stockData(raw: string, yahooSym?: string): Promise<StockData> {
  const ticker = raw.toUpperCase();
  const ysym = yahooSym ?? toYahoo(ticker);
  const hit = cache.get(`${ticker}|${ysym}`);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.d;
  const sources: string[] = [], missing: string[] = [];

  // SEC / Finnhub only cover US listings — never look up "BDX" at the SEC for Budimex (BDX.WA)
  const foreign = /\.[A-Z]{1,2}$/.test(ysym) || /\.[A-Z]{2}$/.test(ticker);
  let cik: number | null = null, title: string | null = null;
  if (!foreign) { try { const m = await cikMap(); cik = m[ticker]?.cik ?? null; title = m[ticker]?.title ?? null; } catch { missing.push("SEC"); } }
  const ySum = summary(ysym);

  const [fin, prof, px, spy, fEarn, fProf, fPeers, fMet] = await Promise.all([
    cik ? secFinancials(cik).catch(() => null) : Promise.resolve(null),
    cik ? secProfile(cik).catch(() => null) : Promise.resolve(null),
    yahooDaily(ysym), yahooDaily("SPY"),
    foreign ? Promise.resolve(null) : finn<{ actual: number | null; estimate: number | null; period: string; quarter: number; year: number; surprise: number | null; surprisePercent: number | null }[]>(`/stock/earnings?symbol=${ticker}`),
    foreign ? Promise.resolve(null) : finn<{ name?: string; country?: string; marketCapitalization?: number; weburl?: string; logo?: string; finnhubIndustry?: string; exchange?: string }>(`/stock/profile2?symbol=${ticker}`),
    foreign ? Promise.resolve(null) : finn<string[]>(`/stock/peers?symbol=${ticker}`),
    foreign ? Promise.resolve(null) : finn<{ metric?: Record<string, number | null> }>(`/stock/metric?symbol=${ticker}&metric=all`),
  ]);
  if (fin) sources.push("SEC XBRL"); else if (cik) missing.push("SEC financials");
  if (px) sources.push("Yahoo"); else missing.push("Yahoo prices");
  if (foreign) { /* EPS estimates / peers / SEC filings exist only for US companies */ }
  else if (process.env.FINNHUB_API_KEY) sources.push("Finnhub"); else missing.push("FINNHUB_API_KEY (EPS estimates, peers)");
  const y = await ySum;
  if (y) sources.push("Yahoo profile");

  const qs = fin?.quarters ?? [];
  const last4 = qs.slice(-4);
  const sum = (k: keyof Quarter) => (last4.length === 4 && last4.every((q) => q[k] != null) ? last4.reduce((a, q) => a + (q[k] as number), 0) : null);
  const revenueTTM = sum("revenue"), netIncomeTTM = sum("netIncome"), epsTTM = sum("eps"), gpTTM = sum("grossProfit");
  const price = px?.price ?? px?.c.at(-1) ?? null;
  const chg1d = px && px.c.length > 1 ? (px.c.at(-1)! / px.c.at(-2)! - 1) * 100 : null;

  // beta vs SPY from daily returns (aligned on common dates)
  let beta: number | null = null;
  if (px && spy) {
    const m = new Map(spy.t.map((t, i) => [Math.floor(t / 86400), spy.c[i]]));
    const a: number[] = [], b: number[] = [];
    let pa: number | null = null, pb: number | null = null;
    px.t.forEach((t, i) => { const s = m.get(Math.floor(t / 86400)); if (s == null) return; if (pa != null && pb != null) { a.push(px.c[i] / pa - 1); b.push(s / pb - 1); } pa = px.c[i]; pb = s; });
    if (a.length > 30) {
      const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
      let cov = 0, vb = 0;
      a.forEach((v, i) => { cov += (v - ma) * (b[i] - mb); vb += (b[i] - mb) ** 2; });
      beta = vb ? cov / vb : null;
    }
  }
  const met = fMet?.metric ?? {};
  const marketCap = fProf?.marketCapitalization ? fProf.marketCapitalization * 1e6 : (met.marketCapitalization ? met.marketCapitalization * 1e6 : null);

  const d: StockData = {
    ticker, name: (foreign ? y?.name : null) ?? fProf?.name ?? prof?.name ?? fin?.name ?? title ?? y?.name ?? ticker, cik,
    industry: fProf?.finnhubIndustry ?? y?.industry ?? prof?.industry ?? null, exchange: fProf?.exchange ?? prof?.exchange ?? y?.exchange ?? null,
    country: fProf?.country ?? y?.country ?? null, web: fProf?.weburl ?? prof?.web ?? y?.web ?? null, logo: fProf?.logo ?? null,
    price, currency: px?.currency ?? "USD", chg1d,
    marketCap: marketCap ?? y?.marketCap ?? null,
    pe: price && epsTTM && epsTTM > 0 ? price / epsTTM : (y?.pe ?? met.peTTM ?? met.peBasicExclExtraTTM ?? null),
    epsTTM: epsTTM ?? y?.eps ?? null, revenueTTM, netIncomeTTM,
    grossMargin: gpTTM != null && revenueTTM ? (gpTTM / revenueTTM) * 100 : (met.grossMarginTTM ?? null),
    netMargin: netIncomeTTM != null && revenueTTM ? (netIncomeTTM / revenueTTM) * 100 : (met.netProfitMarginTTM ?? null),
    dividendYield: y?.dividendYield ?? met.dividendYieldIndicatedAnnual ?? null,
    beta: beta ?? y?.beta ?? met.beta ?? null,
    hi52: px ? Math.max(...px.c) : (met["52WeekHigh"] ?? null), lo52: px ? Math.min(...px.c) : (met["52WeekLow"] ?? null),
    quarters: qs,
    earnings: (fEarn ?? []).map((e) => ({ period: e.period, quarter: e.quarter, year: e.year, actual: e.actual, estimate: e.estimate, surprise: e.surprise, surprisePct: e.surprisePercent })),
    earningsDates: prof?.earningsDates ?? [],
    peers: (fPeers ?? []).filter((p) => p !== ticker).slice(0, 6),
    quoteType: y?.type ?? null, sector: y?.sector ?? null, description: y?.description ?? null, forwardPe: y?.forwardPe ?? null,
    aum: y?.totalAssets ?? null, ter: y?.expenseRatio ?? null, category: y?.category ?? null, family: y?.family ?? null,
    fundHoldings: y?.holdings ?? [],
    benchmark: benchmarkOf(ysym),
    sources, missing,
  };
  cache.set(`${ticker}|${ysym}`, { at: Date.now(), d });
  return d;
}
