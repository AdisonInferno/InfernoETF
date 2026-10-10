/* Server-only: a one-line, evidence-based read of an SEC filing.
 *
 *   Form 4   → parse the insider's own XML: who, buy/sell, shares, price, 10b5-1 plan
 *   10-Q/10-K→ XBRL numbers: revenue + diluted EPS vs the same period a year earlier
 *   8-K      → item codes with an obvious tone (restructuring, impairment…) use fixed rules;
 *              results / agreements / other events are summarised by Gemini from the attached
 *              press release (Exhibit 99) — and ONLY from it
 *
 * Results are cached on disk by accession number (data/intel/insights.json), so each filing is
 * analysed once. */

import { promises as fs } from "node:fs";
import path from "node:path";
import { GoogleGenAI, Type } from "@google/genai";
import { UA } from "./sec";

export type Direction = "up" | "down" | "neutral";
export interface Insight {
  direction: Direction;
  /** ≤ 90 chars, shown on the card */
  headline: string;
  /** 1–3 sentences, shown on hover */
  detail: string;
  /** Where the read comes from */
  basis: "form4" | "xbrl" | "rules" | "ai" | "none";
}
export interface FilingRef { ticker: string; cik: number; form: string; accession: string; doc: string; items: string }

const ARCHIVE = process.env.SEC_ARCHIVE_BASE_URL ?? "https://www.sec.gov";
const DATA = process.env.SEC_DATA_BASE_URL ?? "https://data.sec.gov";
const CACHE_FILE = path.join(process.cwd(), "data", "intel", "insights.json");

/* ── disk cache ── */
type G = typeof globalThis & { __infernoInsights?: { map?: Promise<Record<string, Insight>> } };
const g = globalThis as G;
g.__infernoInsights ??= {};
function cacheMap() {
  g.__infernoInsights!.map ??= fs.readFile(CACHE_FILE, "utf8").then((t) => JSON.parse(t) as Record<string, Insight>).catch(() => ({}));
  return g.__infernoInsights!.map;
}
async function remember(key: string, v: Insight) {
  const m = await cacheMap();
  m[key] = v;
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(m));
}

const get = async (url: string, json = false) => {
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`SEC ${res.status}`);
  return json ? res.json() : res.text();
};
const folder = (f: FilingRef) => `${ARCHIVE}/Archives/edgar/data/${f.cik}/${f.accession.replace(/-/g, "")}`;
const usd = (v: number) => (Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`);
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;

/* ── Form 4 ── */
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>\\s*(?:<value>)?\\s*([^<]*?)\\s*(?:</value>)?\\s*</${name}>`, "i"))?.[1]?.trim() ?? "";
const CODE_LABEL: Record<string, string> = { P: "bought", S: "sold", A: "received a stock award of", M: "exercised options for", F: "had shares withheld for tax —", G: "gifted", D: "returned", C: "converted" };

async function form4(f: FilingRef): Promise<Insight> {
  const raw = f.doc.replace(/^xslF345X\d+\//i, "");
  const xml = String(await get(`${folder(f)}/${raw}`));
  const name = tag(xml, "rptOwnerName").replace(/\s+/g, " ");
  const title = tag(xml, "officerTitle") || (tag(xml, "isDirector") === "1" || tag(xml, "isDirector").toLowerCase() === "true" ? "Director" : "");
  const plan = /<aff10b5One>\s*(1|true)\s*<\/aff10b5One>/i.test(xml) || /10b5-1/i.test(xml);
  const tx = [...xml.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi)].map((m) => {
    const t = m[1];
    const shares = Number(tag(t, "transactionShares")) || 0;
    const price = Number(tag(t, "transactionPricePerShare")) || 0;
    return { code: tag(t, "transactionCode").toUpperCase(), shares, price, value: shares * price };
  });
  const who = `${name || "Insider"}${title ? ` (${title})` : ""}`;
  const sum = (c: string) => tx.filter((x) => x.code === c);
  const buys = sum("P"), sells = sum("S");
  const total = (xs: typeof tx) => xs.reduce((a, x) => a + x.value, 0);
  const shares = (xs: typeof tx) => xs.reduce((a, x) => a + x.shares, 0);
  const avg = (xs: typeof tx) => (shares(xs) ? total(xs) / shares(xs) : 0);

  if (buys.length) {
    return { direction: "up", basis: "form4", headline: `Insider buy · ${usd(total(buys))}`,
      detail: `${who} bought ${shares(buys).toLocaleString("en-US")} shares on the open market at ~$${avg(buys).toFixed(2)}. Open-market purchases with personal money are one of the stronger insider signals.` };
  }
  if (sells.length) {
    return plan
      ? { direction: "neutral", basis: "form4", headline: `Planned sale (10b5-1) · ${usd(total(sells))}`,
          detail: `${who} sold ${shares(sells).toLocaleString("en-US")} shares at ~$${avg(sells).toFixed(2)} under a pre-arranged 10b5-1 plan. Scheduled sales are routine (taxes, diversification) and usually not a view on the stock.` }
      : { direction: "down", basis: "form4", headline: `Insider sale · ${usd(total(sells))}`,
          detail: `${who} sold ${shares(sells).toLocaleString("en-US")} shares at ~$${avg(sells).toFixed(2)}, not flagged as a pre-planned 10b5-1 sale. Discretionary selling is a mild negative signal, stronger when several insiders sell together.` };
  }
  const codes = [...new Set(tx.map((x) => x.code))].filter(Boolean);
  const what = codes.map((c) => CODE_LABEL[c] ?? `code ${c}`).join(", ") || "reported holdings";
  return { direction: "neutral", basis: "form4", headline: codes.includes("A") || codes.includes("M") ? "Stock award / option exercise" : "Holdings update",
    detail: `${who} ${what}${shares(tx) ? ` ${shares(tx).toLocaleString("en-US")} shares` : ""}. Compensation-related — no buying or selling on the open market.` };
}

/* ── 10-Q / 10-K via XBRL ── */
interface Fact { end: string; start?: string; val: number; accn: string; form: string }
const REVENUE = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"];

async function concept(cik: number, name: string, unit: string): Promise<Fact[]> {
  try {
    const j = await get(`${DATA}/api/xbrl/companyconcept/CIK${String(cik).padStart(10, "0")}/us-gaap/${name}.json`, true);
    return (j?.units?.[unit] ?? []) as Fact[];
  } catch { return []; }
}
const days = (f: Fact) => (f.start ? (Date.parse(f.end) - Date.parse(f.start)) / 86400_000 : 0);

/** Value in this filing for the main period, and the same-length period one year earlier. */
function yoy(facts: Fact[], accn: string, annual: boolean) {
  const want = (f: Fact) => (annual ? days(f) > 330 && days(f) < 400 : days(f) > 80 && days(f) < 100);
  const cur = facts.filter((f) => f.accn === accn && want(f)).sort((a, b) => b.end.localeCompare(a.end))[0];
  if (!cur) return null;
  const target = Date.parse(cur.end) - 365 * 86400_000;
  const prev = facts.filter((f) => want(f) && Math.abs(Date.parse(f.end) - target) < 20 * 86400_000).sort((a, b) => b.accn.localeCompare(a.accn))[0];
  return { cur: cur.val, prev: prev?.val ?? null, end: cur.end };
}

async function periodic(f: FilingRef): Promise<Insight> {
  const annual = f.form === "10-K";
  let rev: ReturnType<typeof yoy> = null;
  for (const c of REVENUE) { rev = yoy(await concept(f.cik, c, "USD"), f.accession, annual); if (rev) break; }
  const eps = yoy(await concept(f.cik, "EarningsPerShareDiluted", "USD/shares"), f.accession, annual);
  if (!rev && !eps) return { direction: "neutral", basis: "none", headline: annual ? "Annual report filed" : "Quarterly report filed", detail: "Structured financial data for this filing isn't available yet." };

  const revG = rev?.prev ? ((rev.cur - rev.prev) / Math.abs(rev.prev)) * 100 : null;
  const epsG = eps?.prev ? ((eps.cur - eps.prev) / Math.abs(eps.prev)) * 100 : null;
  const pos = [revG, epsG].filter((x): x is number => x != null);
  const direction: Direction = pos.length && pos.every((x) => x > 2) ? "up" : pos.length && pos.every((x) => x < -2) ? "down" : "neutral";
  const parts = [rev && `Revenue ${usd(rev.cur)}${revG != null ? ` (${pct(revG)} y/y)` : ""}`, eps && `EPS $${eps.cur.toFixed(2)}${epsG != null ? ` (${pct(epsG)})` : ""}`].filter(Boolean);
  const period = annual ? "fiscal year" : "quarter";
  return {
    direction, basis: "xbrl",
    headline: parts.join(" · "),
    detail: `For the ${period} ending ${(rev ?? eps)!.end}: ${parts.join(", ")} versus the same ${period} a year earlier. ${direction === "up" ? "Both sales and earnings grew." : direction === "down" ? "Sales and earnings both declined." : "Mixed picture — not all key lines moved the same way."}`,
  };
}

/* ── 8-K ── */
const RULES: Record<string, Insight> = {
  "2.05": { direction: "down", basis: "rules", headline: "Restructuring / exit costs", detail: "The company disclosed a restructuring plan or exit activity, usually meaning job cuts, closures and one-off charges." },
  "2.06": { direction: "down", basis: "rules", headline: "Material impairment", detail: "The company wrote down the value of assets (e.g. goodwill or an acquisition), signalling they are worth less than expected." },
  "3.01": { direction: "down", basis: "rules", headline: "Listing standard notice", detail: "The exchange flagged a listing-rule issue or the company plans to delist or transfer its listing." },
  "4.01": { direction: "down", basis: "rules", headline: "Auditor change", detail: "The company changed its auditor. Usually routine, but unexpected changes can point to accounting disagreements." },
  "4.02": { direction: "down", basis: "rules", headline: "Prior financials unreliable", detail: "Previously issued financial statements should no longer be relied on and will be restated — a serious red flag." },
  "5.02": { direction: "neutral", basis: "rules", headline: "Leadership change", detail: "An executive or board member was appointed, departed or had their compensation changed." },
  "5.07": { direction: "neutral", basis: "rules", headline: "Shareholder vote results", detail: "Results of matters voted on at the shareholder meeting." },
};

const strip = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'").replace(/&#\d+;|&\w+;/g, " ").replace(/\s+/g, " ").trim();

async function aiRead(f: FilingRef, text: string): Promise<Insight | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || text.length < 200) return null;
  const ai = new GoogleGenAI({ apiKey: key });
  const res = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
    contents: `Company: ${f.ticker}\nFiling: ${f.form} (items ${f.items || "n/a"})\n\nDOCUMENT TEXT:\n${text.slice(0, 14000)}`,
    config: {
      systemInstruction: "You are an equity analyst. Using ONLY the provided SEC filing text (no outside knowledge), judge whether the disclosed news is positive (up), negative (down) or neutral for shareholders. headline: max 80 characters, concrete numbers where present. detail: max 2 sentences explaining why.",
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: { direction: { type: Type.STRING, enum: ["up", "down", "neutral"] }, headline: { type: Type.STRING }, detail: { type: Type.STRING } },
        required: ["direction", "headline", "detail"],
        propertyOrdering: ["direction", "headline", "detail"],
      },
    },
  });
  const j = JSON.parse(res.text ?? "{}");
  if (!j.headline) return null;
  const dir: Direction = j.direction === "up" || j.direction === "down" ? j.direction : "neutral";
  return { direction: dir, basis: "ai", headline: String(j.headline).slice(0, 90), detail: String(j.detail ?? "").slice(0, 400) };
}

async function eightK(f: FilingRef): Promise<Insight> {
  const codes = f.items.split(",").map((s) => s.trim()).filter(Boolean);
  const rule = codes.map((c) => RULES[c]).find((r) => r?.direction === "down");
  if (rule) return rule;
  // Prefer the press release (Exhibit 99.x); fall back to the 8-K body.
  let text = "";
  try {
    const idx = await get(`${folder(f)}/index.json`, true);
    const files: string[] = (idx?.directory?.item ?? []).map((i: { name: string }) => i.name);
    const ex = files.find((n) => /ex-?99/i.test(n) && /\.html?$/i.test(n));
    text = strip(String(await get(`${folder(f)}/${ex ?? f.doc}`)));
  } catch { /* fall through */ }
  const ai = await aiRead(f, text).catch(() => null);
  if (ai) return ai;
  const neutral = codes.map((c) => RULES[c]).find(Boolean);
  if (neutral) return neutral;
  return { direction: "neutral", basis: "none", headline: codes.includes("2.02") ? "Results released — open filing" : "Event disclosed — open filing", detail: "Add GEMINI_API_KEY to get an automatic read of this filing's press release." };
}

/* ── entry ── */
export async function insightFor(f: FilingRef): Promise<Insight> {
  const m = await cacheMap();
  if (m[f.accession]) return m[f.accession];
  let out: Insight;
  try {
    out = f.form === "4" ? await form4(f)
      : f.form === "10-Q" || f.form === "10-K" ? await periodic(f)
      : f.form === "8-K" ? await eightK(f)
      : { direction: "neutral", basis: "none", headline: "Filed — open document", detail: "No automatic read for this form type yet." };
  } catch (e) {
    return { direction: "neutral", basis: "none", headline: "Insight unavailable", detail: e instanceof Error ? e.message : "SEC request failed" }; // not cached → retried later
  }
  if (out.basis !== "none") await remember(f.accession, out);
  return out;
}
