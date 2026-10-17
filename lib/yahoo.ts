/* ─────────────────────────────────────────────────────────────
   Yahoo Finance helpers (server-side, no API key):
   · search(name)   → candidate symbols for a company / fund NAME (used to verify broker screenshots)
   · summary(sym)   → fundamentals for ANY listed stock or ETF worldwide: market cap, P/E, EPS, dividend, beta,
                      52-week range, sector / industry / country / description, and for funds: AUM (total assets),
                      expense ratio, category and top holdings.
   quoteSummary needs a cookie + "crumb" (fetched once, cached). Everything degrades to null when Yahoo is
   unreachable — callers keep their own fallbacks.
   ───────────────────────────────────────────────────────────── */

const Q1 = process.env.YAHOO_BASE_URL ?? "https://query1.finance.yahoo.com";
const Q2 = process.env.YAHOO_BASE_URL ?? "https://query2.finance.yahoo.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

type G = typeof globalThis & { __yahoo?: { auth?: Promise<{ cookie: string; crumb: string } | null>; at?: number; sum: Map<string, { at: number; v: YSummary | null }>; srch: Map<string, { at: number; v: YHit[] }> } };
const g = globalThis as G;
g.__yahoo ??= { sum: new Map(), srch: new Map() };
const box = g.__yahoo;

async function auth() {
  if (box.auth && box.at && Date.now() - box.at < 6 * 3600_000) return box.auth;
  box.at = Date.now();
  box.auth = (async () => {
    try {
      const r = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(6000) });
      const cookie = (r.headers.getSetCookie?.() ?? [r.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
      const c = await fetch(`${Q2}/v1/test/getcrumb`, { headers: { "User-Agent": UA, Cookie: cookie }, signal: AbortSignal.timeout(6000) });
      const crumb = c.ok ? (await c.text()).trim() : "";
      return crumb && !crumb.includes("<") ? { cookie, crumb } : null;
    } catch { return null; }
  })();
  return box.auth;
}

export interface YHit { symbol: string; name: string; exchange: string; type: string }
/** Yahoo symbol search by company / fund name (no crumb needed). */
export async function search(q: string): Promise<YHit[]> {
  const k = q.toLowerCase().trim();
  const hit = box.srch.get(k);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.v;
  let v: YHit[] = [];
  try {
    const r = await fetch(`${Q2}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const j = await r.json();
      v = ((j.quotes ?? []) as { symbol?: string; shortname?: string; longname?: string; exchange?: string; exchDisp?: string; quoteType?: string }[])
        .filter((x) => x.symbol && (x.quoteType === "EQUITY" || x.quoteType === "ETF" || x.quoteType === "MUTUALFUND"))
        .map((x) => ({ symbol: x.symbol!, name: x.longname ?? x.shortname ?? x.symbol!, exchange: x.exchDisp ?? x.exchange ?? "", type: x.quoteType! }));
    }
  } catch { /* offline */ }
  box.srch.set(k, { at: Date.now(), v });
  return v;
}

export interface YSummary {
  symbol: string; name: string | null; type: string | null; currency: string | null; exchange: string | null;
  price: number | null; marketCap: number | null; pe: number | null; forwardPe: number | null; eps: number | null;
  dividendYield: number | null; beta: number | null; hi52: number | null; lo52: number | null;
  sector: string | null; industry: string | null; country: string | null; web: string | null; description: string | null;
  // funds
  totalAssets: number | null; expenseRatio: number | null; category: string | null; family: string | null;
  holdings: { symbol: string; name: string; w: number }[];
}
const raw = (o: unknown): number | null => {
  const v = (o as { raw?: number } | undefined)?.raw ?? (typeof o === "number" ? o : undefined);
  return typeof v === "number" && isFinite(v) ? v : null;
};

/** Fundamentals for any symbol (Yahoo form, e.g. NVDA, BDX.WA, VWCE.DE). Cached 6 h. */
export async function summary(sym: string): Promise<YSummary | null> {
  const k = sym.toUpperCase();
  const hit = box.sum.get(k);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.v;
  let v: YSummary | null = null;
  try {
    const a = await auth();
    const mods = "price,summaryDetail,defaultKeyStatistics,assetProfile,fundProfile,topHoldings";
    const url = `${Q2}/v10/finance/quoteSummary/${encodeURIComponent(k)}?modules=${mods}${a ? `&crumb=${encodeURIComponent(a.crumb)}` : ""}`;
    const r = await fetch(url, { headers: { "User-Agent": UA, ...(a ? { Cookie: a.cookie } : {}) }, signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const res = (await r.json())?.quoteSummary?.result?.[0];
      if (res) {
        const p = res.price ?? {}, s = res.summaryDetail ?? {}, ks = res.defaultKeyStatistics ?? {}, ap = res.assetProfile ?? {}, fp = res.fundProfile ?? {}, th = res.topHoldings ?? {};
        v = {
          symbol: k, name: p.longName ?? p.shortName ?? null, type: p.quoteType ?? null, currency: p.currency ?? null, exchange: p.exchangeName ?? null,
          price: raw(p.regularMarketPrice), marketCap: raw(p.marketCap) ?? raw(s.marketCap),
          pe: raw(s.trailingPE), forwardPe: raw(s.forwardPE) ?? raw(ks.forwardPE), eps: raw(ks.trailingEps),
          dividendYield: (raw(s.dividendYield) ?? raw(s.yield)) != null ? (raw(s.dividendYield) ?? raw(s.yield))! * 100 : null,
          beta: raw(s.beta) ?? raw(ks.beta3Year), hi52: raw(s.fiftyTwoWeekHigh), lo52: raw(s.fiftyTwoWeekLow),
          sector: ap.sector ?? null, industry: ap.industry ?? fp.categoryName ?? null, country: ap.country ?? null, web: ap.website ?? null,
          description: ap.longBusinessSummary ?? null,
          totalAssets: raw(s.totalAssets) ?? raw(ks.totalAssets),
          expenseRatio: (() => { const e = raw(fp.feesExpensesInvestment?.annualReportExpenseRatio) ?? raw(ks.annualReportExpenseRatio); return e != null ? e * 100 : null; })(),
          category: fp.categoryName ?? ks.category ?? null, family: fp.family ?? ks.fundFamily ?? null,
          holdings: ((th.holdings ?? []) as { symbol?: string; holdingName?: string; holdingPercent?: unknown }[])
            .map((h) => ({ symbol: h.symbol ?? "", name: h.holdingName ?? h.symbol ?? "", w: (raw(h.holdingPercent) ?? 0) * 100 })).filter((h) => h.w > 0),
        };
      }
    }
  } catch { /* offline */ }
  box.sum.set(k, { at: Date.now(), v });
  return v;
}

/* ── broker (XTB) ↔ Yahoo symbol forms ── */
const XTB_TO_Y: Record<string, string> = { US: "", PL: ".WA", DE: ".DE", UK: ".L", NL: ".AS", FR: ".PA", IT: ".MI", ES: ".MC", CH: ".SW", BE: ".BR", PT: ".LS", DK: ".CO", SE: ".ST", NO: ".OL", FI: ".HE", CZ: ".PR", AT: ".VI", IE: ".IR" };
const Y_TO_XTB = Object.fromEntries(Object.entries(XTB_TO_Y).filter(([, y]) => y).map(([x, y]) => [y, x]));
export const toYahoo = (xtb: string) => { const m = /^([A-Z0-9-]+)\.([A-Z]{2})$/.exec(xtb.toUpperCase()); return m && m[2] in XTB_TO_Y ? m[1] + XTB_TO_Y[m[2]] : xtb.toUpperCase(); };
export const toXtb = (y: string) => { const m = /^([A-Z0-9-]+)(\.[A-Z]{1,2})$/.exec(y.toUpperCase()); return m && Y_TO_XTB[m[2]] ? `${m[1]}.${Y_TO_XTB[m[2]]}` : y.toUpperCase(); };
/** account / listing currency → the Yahoo suffixes that trade in it (to pick the right listing of a company) */
export const SUFFIX_BY_CCY: Record<string, string[]> = { PLN: [".WA"], EUR: [".DE", ".AS", ".PA", ".MI", ".MC", ".BR", ".LS", ".HE", ".VI", ".IR"], GBP: [".L"], CHF: [".SW"], USD: [""], DKK: [".CO"], SEK: [".ST"], NOK: [".OL"], CZK: [".PR"] };
