/* Server-only: recent SEC EDGAR filings for a list of tickers (official, free, no key).
 *
 * SEC asks every client to identify itself: set SEC_USER_AGENT="InfernoETF your@email.com"
 * in .env.local. Fair-access limit is 10 req/s — we stay well below with small batches and a
 * 30-minute cache. */

export interface Filing {
  ticker: string;
  company: string;
  form: string;
  /** ISO timestamp the SEC accepted the filing */
  acceptedAt: string;
  description: string;
  url: string;
  /** Raw identifiers — used to compute the filing's insight (lib/intel/filing-insight.ts) */
  cik: number;
  accession: string;
  doc: string;
  items: string;
}

export const UA = process.env.SEC_USER_AGENT ?? "InfernoETF research app";
const TTL = 30 * 60_000;
const FORMS = new Set(["8-K", "10-Q", "10-K", "4", "6-K", "20-F", "S-1", "SC 13D", "SC 13G", "DEF 14A"]);

/** 8-K item codes → readable labels (most common ones). */
const ITEMS: Record<string, string> = {
  "1.01": "Material agreement signed", "1.02": "Material agreement terminated", "2.01": "Acquisition or disposal completed",
  "2.02": "Quarterly results released", "2.03": "New debt obligation", "2.05": "Restructuring / exit costs", "2.06": "Material impairment",
  "3.01": "Listing / delisting notice", "4.01": "Auditor change", "5.02": "Executive / director change", "5.03": "Bylaws amended",
  "5.07": "Shareholder vote results", "7.01": "Regulation FD disclosure", "8.01": "Other material event", "9.01": "Financial exhibits",
};
const FORM_DESC: Record<string, string> = {
  "10-Q": "Quarterly report", "10-K": "Annual report", "4": "Insider transaction", "6-K": "Foreign issuer report",
  "20-F": "Foreign annual report", "S-1": "Registration statement", "SC 13D": "Activist stake (>5%)", "SC 13G": "Passive stake (>5%)",
  "DEF 14A": "Proxy statement",
};

type G = typeof globalThis & { __infernoSec?: { cik?: Promise<Record<string, { cik: number; title: string }>>; subs: Map<string, { at: number; data: Filing[] }> } };
const g = globalThis as G;
g.__infernoSec ??= { subs: new Map() };
const box = g.__infernoSec;

export const sec = async (url: string) => {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`SEC ${res.status}`);
  return res.json();
};

function cikMap() {
  box.cik ??= sec(`${process.env.SEC_FILES_BASE_URL ?? "https://www.sec.gov"}/files/company_tickers.json`)
    .then((j: Record<string, { cik_str: number; ticker: string; title: string }>) =>
      Object.fromEntries(Object.values(j).map((r) => [r.ticker.toUpperCase().replace("-", "."), { cik: r.cik_str, title: r.title }]))
    )
    .catch((e) => { box.cik = undefined; throw e; });
  return box.cik;
}

function describe(form: string, items: string): string {
  if (form === "8-K") {
    const codes = items.split(",").map((s) => s.trim()).filter((c) => c && c !== "9.01");
    const labels = codes.map((c) => ITEMS[c]).filter(Boolean);
    return labels.length ? labels.slice(0, 2).join(" · ") : "Current report";
  }
  return FORM_DESC[form] ?? form;
}

async function filingsFor(ticker: string, cik: number, title: string): Promise<Filing[]> {
  const hit = box.subs.get(ticker);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const pad = String(cik).padStart(10, "0");
  const j = await sec(`${process.env.SEC_DATA_BASE_URL ?? "https://data.sec.gov"}/submissions/CIK${pad}.json`);
  const r = j?.filings?.recent;
  const out: Filing[] = [];
  for (let i = 0; r && i < Math.min(40, r.form.length); i++) {
    const form = r.form[i];
    if (!FORMS.has(form)) continue;
    out.push({
      ticker,
      company: title,
      form,
      acceptedAt: r.acceptanceDateTime?.[i] || `${r.filingDate[i]}T00:00:00.000Z`,
      description: describe(form, r.items?.[i] ?? ""),
      url: `https://www.sec.gov/Archives/edgar/data/${cik}/${String(r.accessionNumber[i]).replace(/-/g, "")}/${r.primaryDocument[i]}`,
      cik,
      accession: String(r.accessionNumber[i]),
      doc: String(r.primaryDocument[i]),
      items: r.items?.[i] ?? "",
    });
  }
  box.subs.set(ticker, { at: Date.now(), data: out });
  return out;
}

/** Latest filings across `tickers`, newest first. Unknown tickers (no SEC registration) are skipped. */
export async function recentFilings(tickers: string[], limit = 12): Promise<{ filings: Filing[]; error?: string }> {
  let map: Awaited<ReturnType<typeof cikMap>>;
  try { map = await cikMap(); } catch (e) { return { filings: [], error: e instanceof Error ? e.message : "SEC unavailable" }; }
  const known = tickers.filter((t) => map[t]);
  const all: Filing[] = [];
  // 4 at a time, short pause between batches → ≈ 6 req/s max
  for (let i = 0; i < known.length; i += 4) {
    const batch = await Promise.allSettled(known.slice(i, i + 4).map((t) => filingsFor(t, map[t].cik, map[t].title)));
    batch.forEach((b) => b.status === "fulfilled" && all.push(...b.value));
    if (i + 4 < known.length) await new Promise((r) => setTimeout(r, 700));
  }
  return { filings: all.sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt)).slice(0, limit) };
}
