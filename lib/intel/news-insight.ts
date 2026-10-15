/* Server-only: AI read of a single news article — short summary + impact per mentioned ticker.
 * Every article is analysed ONCE; results live on disk (data/intel/news-insights.json) so the
 * Gemini quota is never spent twice on the same headline. */

import { promises as fs } from "node:fs";
import path from "node:path";
import { GoogleGenAI, Type } from "@google/genai";

export type Dir = "up" | "down" | "neutral";
export interface NewsInsight { summary: string; impacts: { ticker: string; direction: Dir; why: string }[]; model: string; at: number }

const FILE = path.join(process.cwd(), "data", "intel", "news-insights.json");
type G = typeof globalThis & { __infernoNewsIns?: Promise<Record<string, NewsInsight>> };
const g = globalThis as G;
const load = () => (g.__infernoNewsIns ??= fs.readFile(FILE, "utf8").then((t) => JSON.parse(t)).catch(() => ({})));
let writing: Promise<void> = Promise.resolve();
async function save(db: Record<string, NewsInsight>) {
  writing = writing.then(async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(db));
  });
  return writing;
}

export async function cachedInsight(id: string): Promise<NewsInsight | null> {
  return (await load())[id] ?? null;
}
export async function cachedMany(ids: string[]): Promise<Record<string, NewsInsight>> {
  const db = await load();
  return Object.fromEntries(ids.filter((i) => db[i]).map((i) => [i, db[i]]));
}

const MODELS = () => [...new Set([process.env.GEMINI_MODEL ?? "gemini-3.5-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"])];

export async function insightFor(a: { id: string; headline: string; summary: string; source: string; tickers: string[] }): Promise<NewsInsight> {
  const db = await load();
  if (db[a.id]) return db[a.id];
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Brak GEMINI_API_KEY");
  const ai = new GoogleGenAI({ apiKey: key });
  let last: unknown;
  for (const model of MODELS()) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: `HEADLINE: ${a.headline}\nSOURCE: ${a.source}\nTEXT: ${a.summary.slice(0, 1500)}\nTICKERS: ${a.tickers.join(", ") || "(none tagged — pick the 1–3 most affected US-listed tickers or ETFs)"}`,
        config: {
          systemInstruction:
            "You are a sell-side equity analyst. Using ONLY the given text, write a 1–2 sentence summary of what happened and why it matters for investors (max 220 characters). " +
            "For each ticker, judge the likely direct impact on that company's stock: up, down or neutral, with a reason of max 70 characters. Do not invent numbers.",
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              impacts: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
                ticker: { type: Type.STRING }, direction: { type: Type.STRING, enum: ["up", "down", "neutral"] }, why: { type: Type.STRING },
              }, required: ["ticker", "direction", "why"] } },
            },
            required: ["summary", "impacts"],
          },
        },
      });
      const j = JSON.parse(res.text ?? "{}") as { summary?: string; impacts?: NewsInsight["impacts"] };
      const out: NewsInsight = {
        summary: String(j.summary ?? "").slice(0, 300),
        impacts: (j.impacts ?? []).slice(0, 4).map((x) => ({ ticker: String(x.ticker).toUpperCase().slice(0, 8), direction: (["up", "down", "neutral"].includes(x.direction) ? x.direction : "neutral") as Dir, why: String(x.why ?? "").slice(0, 90) })),
        model, at: Math.floor(Date.now() / 1000),
      };
      db[a.id] = out;
      await save(db);
      return out;
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (/"code"\s*:\s*(429|404)|RESOURCE_EXHAUSTED|not found/i.test(msg)) continue; // quota / model → next model
      throw e;
    }
  }
  throw last instanceof Error ? last : new Error("Gemini unavailable");
}
