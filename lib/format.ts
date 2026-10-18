/* Market-value formatting for every view — one place that knows which currency a ticker trades in.
   · currencyOf(ticker, hint) → ISO code (quote currency from the data feed wins; otherwise the listing suffix)
   · formatMarketValue(v, ccy, opts) → "$12.34" / "$2.45B" for USD, "680.00 PLN" / "2.45B PLN" for everything else
   · Missing / non-finite numbers always render as NA ("—"); style them with NA_CLASS. Never a fake 0. */

export const NA = "—";
/** muted terminal style for a missing value */
export const NA_CLASS = "text-zinc-600";

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** listing suffix → quote currency (Yahoo ".WA", XTB-style ".PL" for Warsaw, etc.) */
const SUFFIX_CCY: Record<string, string> = {
  WA: "PLN", PL: "PLN",
  DE: "EUR", F: "EUR", AS: "EUR", NL: "EUR", PA: "EUR", FR: "EUR", MI: "EUR", IT: "EUR", MC: "EUR", ES: "EUR", BR: "EUR", BE: "EUR", VI: "EUR", AT: "EUR", LS: "EUR", PT: "EUR", HE: "EUR", FI: "EUR", IR: "EUR", IE: "EUR",
  L: "GBP", UK: "GBP", SW: "CHF", CH: "CHF", CO: "DKK", DK: "DKK", ST: "SEK", SE: "SEK", OL: "NOK", NO: "NOK", PR: "CZK", CZ: "CZK",
  T: "JPY", HK: "HKD", TO: "CAD", AX: "AUD",
};
const EXCHANGE_CCY: Record<string, string> = { WSE: "PLN", GPW: "PLN", WARSAW: "PLN", NEWCONNECT: "PLN", XETRA: "EUR", EURONEXT: "EUR", LSE: "GBP", SIX: "CHF" };

/** Quote currency of a listing. `hint.currency` (from the data feed) wins; pence are reported as GBP. */
export function currencyOf(ticker: string, hint?: { currency?: string | null; exchange?: string | null }): string {
  const c = hint?.currency?.trim();
  if (c) return c === "GBp" || c === "GBX" ? "GBP" : c.toUpperCase();
  const ex = hint?.exchange?.toUpperCase().replace(/[^A-Z]/g, "");
  if (ex && EXCHANGE_CCY[ex]) return EXCHANGE_CCY[ex];
  const m = /\.([A-Z]{1,2})$/.exec(ticker.toUpperCase());
  return (m && SUFFIX_CCY[m[1]]) || "USD";
}

export interface FmtOpts {
  /** 1.23T / 4.56B / 7.8M scaling (market caps, AUM, revenue) */
  compact?: boolean;
  /** decimals for the plain (non-compact) value — default 2 */
  digits?: number;
  /** leading "+" for positive values */
  signed?: boolean;
}

/** "$680.00" · "680.00 PLN" · "$2.45B" · "2.45B PLN" · "—" when the value is missing. */
export function formatMarketValue(v: number | null | undefined, ccy = "USD", opts: FmtOpts = {}): string {
  if (!isNum(v)) return NA;
  const a = Math.abs(v), sign = v < 0 ? "−" : opts.signed && v > 0 ? "+" : "";
  let body: string;
  if (opts.compact && a >= 1e6) body = a >= 1e12 ? `${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : `${(a / 1e6).toFixed(1)}M`;
  else body = a.toLocaleString("en-US", { minimumFractionDigits: opts.digits ?? 2, maximumFractionDigits: opts.digits ?? 2 });
  return ccy === "USD" ? `${sign}$${body}` : `${sign}${body} ${ccy}`;
}

/** plain number / ratio (P/E, beta) or NA */
export const fmtRatio = (v: number | null | undefined, d = 2) => (isNum(v) ? v.toFixed(d) : NA);
/** percentage value (not a change) or NA */
export const fmtPctValue = (v: number | null | undefined, d = 2) => (isNum(v) ? `${v.toFixed(d)}%` : NA);
/** Tailwind class for a formatted value: muted when it is NA */
export const naTone = (s: string, cls = "text-zinc-100") => (s === NA ? NA_CLASS : cls);
