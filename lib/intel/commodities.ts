/* Server-only: commodity news, tagged with the focus sectors it matters for.
 *
 * 1. Pick commodity articles from the archive (sub-sector or commodity keywords).
 * 2. Gemini tags each one in batches: which focus sectors it affects ("all" if it hits every
 *    sector, e.g. oil shock), importance 1–5 and a one-line "why". Without a key, a keyword
 *    heuristic is used.
 * 3. Tags are cached on disk (data/intel/commodity-tags.json) — each article is tagged once. */

import { promises as fs } from "node:fs";
import path from "node:path";
import { GoogleGenAI, Type } from "@google/genai";
import { queryArchive } from "@/lib/news-archive/store";
import type { CleanArticle } from "@/lib/news-archive/quality";
import { FOCUS, type SectorId } from "./focus";

export type SectorTag = SectorId | "all";
export interface CommodityTag { sectors: SectorTag[]; importance: number; why: string; basis: "ai" | "rules" }
export interface CommodityItem { id: string; ts: number; headline: string; url: string; source: string; commodity: string; tag: CommodityTag }

const COMMODITY_SUBS = new Set(["Oil & Gas", "Oil & Gas E&P", "Refining", "Midstream", "Precious Metals", "Metals & Mining", "Copper Mining", "Uranium", "Steel", "Chemicals", "Energy Futures", "Metals Futures", "Agriculture Futures"]);
const WORDS: [string, RegExp][] = [
  ["Oil", /\b(oil|crude|brent|wti|opec\+?|barrels?)\b/i],
  ["Gas", /\b(natural gas|lng)\b/i],
  ["Gold", /\bgold\b/i],
  ["Silver", /\bsilver\b/i],
  ["Copper", /\bcopper\b/i],
  ["Rare earths", /\b(rare[- ]earths?|neodymium|dysprosium)\b/i],
  ["Gallium/Germanium", /\b(gallium|germanium)\b/i],
  ["Lithium", /\blithium\b/i],
  ["Nickel/Cobalt", /\b(nickel|cobalt)\b/i],
  ["Titanium", /\btitanium\b/i],
  ["Aluminium", /\b(aluminium|aluminum)\b/i],
  ["Steel", /\b(steel|iron ore)\b/i],
  ["Uranium", /\b(uranium|enriched fuel)\b/i],
  ["Helium/Neon", /\b(helium|neon)\b/i],
  ["Commodities", /\b(commodit(y|ies)|metals? prices?|mining)\b/i],
];

const CACHE = path.join(process.cwd(), "data", "intel", "commodity-tags.json");
type G = typeof globalThis & { __infernoCommodity?: Promise<Record<string, CommodityTag>> };
const g = globalThis as G;
const loadTags = () => (g.__infernoCommodity ??= fs.readFile(CACHE, "utf8").then((t) => JSON.parse(t)).catch(() => ({})));
async function saveTags(m: Record<string, CommodityTag>) {
  await fs.mkdir(path.dirname(CACHE), { recursive: true });
  await fs.writeFile(CACHE, JSON.stringify(m));
}

const commodityOf = (a: CleanArticle) => WORDS.find(([, re]) => re.test(`${a.headline} ${a.summary}`))?.[0] ?? (a.subs.some((s) => COMMODITY_SUBS.has(s)) ? "Commodities" : null);

/* ── fallback: keyword heuristic ── */
function heuristic(a: CleanArticle, commodity: string): CommodityTag {
  const t = `${a.headline} ${a.summary}`.toLowerCase();
  const sectors: SectorTag[] = [];
  if (/(rare earth|gallium|germanium|neon|helium|copper|silicon|chip|semiconductor|data cent)/.test(t)) sectors.push("tech");
  if (/(titanium|rare earth|nickel|cobalt|steel|aluminium|aluminum|munition|defen[cs]e|military|jet fuel)/.test(t)) sectors.push("defense");
  if (!sectors.length && /(oil|crude|opec|natural gas|brent|wti)/.test(t)) sectors.push("all");
  return { sectors: sectors.length ? sectors : ["all"], importance: /(ban|export (curb|control|restriction)s?|shortage|surge|plunge|record)/.test(t) ? 4 : 2, why: `${commodity} news`, basis: "rules" };
}

/* ── Gemini batch tagging ── */
async function tagWithAI(items: { a: CleanArticle; commodity: string }[]): Promise<Record<string, CommodityTag>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !items.length) return {};
  const sectorsDesc = FOCUS.map((f) => `- ${f.id} (${f.label}): depends on ${f.inputs}`).join("\n");
  const list = items.map(({ a, commodity }, i) => `${i}. [${commodity}] ${a.headline}${a.summary ? ` — ${a.summary.slice(0, 240)}` : ""}`).join("\n");
  const ai = new GoogleGenAI({ apiKey: key });
  const res = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
    contents: `SECTORS:\n${sectorsDesc}\n\nCOMMODITY NEWS:\n${list}`,
    config: {
      systemInstruction:
        "You are a commodities strategist. For each numbered news item decide which of the listed sectors it materially affects through costs, supply or demand. " +
        'Use "all" only for broad shocks that hit every sector (e.g. oil price spikes, broad energy crises). Use an empty list if it affects none of them. ' +
        "importance: 1 = minor, 3 = notable, 5 = major supply/price shock. why: max 90 characters, name the mechanism (e.g. \"Gallium export curbs threaten chip supply\"). Use only the given text.",
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            i: { type: Type.INTEGER },
            sectors: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...FOCUS.map((f) => f.id), "all"] } },
            importance: { type: Type.INTEGER, minimum: 1, maximum: 5 },
            why: { type: Type.STRING },
          },
          required: ["i", "sectors", "importance", "why"],
          propertyOrdering: ["i", "sectors", "importance", "why"],
        },
      },
    },
  });
  const out: Record<string, CommodityTag> = {};
  for (const r of JSON.parse(res.text ?? "[]") as { i: number; sectors: string[]; importance: number; why: string }[]) {
    const it = items[r.i];
    if (!it) continue;
    out[it.a.id] = {
      sectors: r.sectors.filter((s): s is SectorTag => s === "all" || FOCUS.some((f) => f.id === s)),
      importance: Math.max(1, Math.min(5, Math.round(r.importance || 2))),
      why: String(r.why ?? "").slice(0, 110),
      basis: "ai",
    };
  }
  return out;
}

export async function commodityNews(sector: SectorId, days = 7, limit = 10): Promise<{ items: CommodityItem[]; pending: number }> {
  const from = Math.floor(Date.now() / 1000) - days * 86400;
  const pool = (await queryArchive({ from, limit: 1000 }))
    .map((a) => ({ a, commodity: commodityOf(a) }))
    .filter((x): x is { a: CleanArticle; commodity: string } => x.commodity !== null)
    .slice(0, 120);

  const tags = await loadTags();
  const untagged = pool.filter((x) => !tags[x.a.id]);
  if (untagged.length) {
    let fresh: Record<string, CommodityTag> = {};
    for (let i = 0; i < untagged.length; i += 40) {
      try { Object.assign(fresh, await tagWithAI(untagged.slice(i, i + 40))); } catch { fresh = { ...fresh }; break; }
    }
    // anything the AI didn't tag (no key / error) gets the heuristic — not cached, so AI retries later
    const aiTagged = Object.keys(fresh).length;
    Object.assign(tags, fresh);
    if (aiTagged) await saveTags(tags);
  }

  const items: CommodityItem[] = pool
    .map(({ a, commodity }) => ({ id: a.id, ts: a.ts, headline: a.headline, url: a.url, source: a.source, commodity, tag: tags[a.id] ?? heuristic(a, commodity) }))
    .filter((x) => x.tag.sectors.includes(sector) || x.tag.sectors.includes("all"))
    .sort((p, q) => q.tag.importance - p.tag.importance || q.ts - p.ts)
    .slice(0, limit);
  return { items, pending: pool.filter((x) => !tags[x.a.id]).length };
}

/** Main commodities offered as quick filters (names match WORDS above). */
export const MAIN_COMMODITIES = ["Gold", "Oil", "Gas", "Silver", "Copper"];

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** News about one commodity, any sector. `name` is one of WORDS (uses its regex) or free text (whole-word match). */
export async function commodityByName(name: string, days = 14, limit = 12): Promise<{ items: CommodityItem[] }> {
  const q = name.trim().slice(0, 40);
  if (!q) return { items: [] };
  const known = WORDS.find(([w]) => w.toLowerCase() === q.toLowerCase());
  const re = known ? known[1] : new RegExp(`\\b${esc(q)}`, "i");
  const label = known ? known[0] : q.replace(/\b\w/g, (c) => c.toUpperCase());
  const from = Math.floor(Date.now() / 1000) - days * 86400;
  const tags = await loadTags();
  const items = (await queryArchive({ from, limit: 3000 }))
    .filter((a) => re.test(`${a.headline} ${a.summary}`))
    .slice(0, 200)
    .map((a) => ({ id: a.id, ts: a.ts, headline: a.headline, url: a.url, source: a.source, commodity: label, tag: tags[a.id] ?? heuristic(a, label) }))
    .sort((p, q2) => q2.tag.importance - p.tag.importance || q2.ts - p.ts)
    .slice(0, limit);
  return { items };
}

/** Macro headlines (rates, inflation, broad market) — shown for every sector. */
export async function macroNews(days = 7, limit = 6) {
  const from = Math.floor(Date.now() / 1000) - days * 86400;
  return (await queryArchive({ from, limit: 1000 }))
    .filter((a) => a.kind === "macro")
    .slice(0, limit)
    .map((a) => ({ id: a.id, ts: a.ts, headline: a.headline, url: a.url, source: a.source, tickers: a.relevant.slice(0, 3) }));
}
