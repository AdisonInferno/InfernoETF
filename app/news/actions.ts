"use server";

import { GoogleGenAI, Type } from "@google/genai";
import { fetchSectorNews, isSector, type NewsArticle, type Sector } from "@/lib/news";

/* "Open kitchen" analysis: the model only sees the articles we fetch here, and we return
   those exact articles + the exact prompt alongside the answer so the UI can show them. */

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

const SYSTEM_INSTRUCTION =
  "You are a data-driven financial analyst. Analyze ONLY the provided news. Do not use outside knowledge. " +
  "Provide a 2-sentence summary of the catalyst and state if the sentiment is BULLISH, BEARISH, or NEUTRAL. " +
  "List the ids of the articles your summary relies on.";

export type Sentiment = "BULLISH" | "BEARISH" | "NEUTRAL";

export interface Insight {
  summary: string;
  sentiment: Sentiment;
  /** Article ids the model says it used (e.g. ["S1","S3"]) — only ids we actually sent. */
  cited: string[];
}

export type AnalysisResult =
  | { ok: true; sector: Sector; insight: Insight; sources: NewsArticle[]; prompt: string; systemInstruction: string; model: string; generatedAt: string }
  | { ok: false; sector: Sector; error: string; sources: NewsArticle[] };

/** Plain, numbered text block — exactly what the model receives. */
function formatArticles(articles: NewsArticle[]): string {
  return articles
    .map((a) => `[${a.id}] ${a.title}\nSource: ${a.source} | Date: ${a.date}\n${a.snippet}`)
    .join("\n\n");
}

export async function analyzeSectorNews(sectorInput: string): Promise<AnalysisResult> {
  // Server Actions are public endpoints: validate input.
  const sector: Sector = isSector(sectorInput) ? sectorInput : "tech";
  const sources = await fetchSectorNews(sector);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, sector, sources, error: "Brak GEMINI_API_KEY w .env.local (zrestartuj `npm run dev` po dodaniu klucza)." };

  const prompt = `Sector: ${sector.toUpperCase()}\n\nNEWS ARTICLES:\n\n${formatArticles(sources)}`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.2,
        // Structured output so the UI never has to parse prose for the sentiment label.
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "Exactly 2 sentences describing the catalyst." },
            sentiment: { type: Type.STRING, enum: ["BULLISH", "BEARISH", "NEUTRAL"] },
            cited: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Ids of the articles used, e.g. S1." },
          },
          required: ["summary", "sentiment", "cited"],
          propertyOrdering: ["summary", "sentiment", "cited"],
        },
      },
    });

    const parsed = JSON.parse(res.text ?? "{}") as Partial<Insight>;
    const ids = new Set(sources.map((s) => s.id));
    const sentiment: Sentiment = parsed.sentiment === "BULLISH" || parsed.sentiment === "BEARISH" ? parsed.sentiment : "NEUTRAL";
    if (!parsed.summary) throw new Error("Empty response from model");

    return {
      ok: true,
      sector,
      insight: { summary: parsed.summary.trim(), sentiment, cited: (parsed.cited ?? []).filter((c) => ids.has(c)) },
      sources,
      prompt,
      systemInstruction: SYSTEM_INSTRUCTION,
      model: MODEL,
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { ok: false, sector, sources, error: e instanceof Error ? e.message : "Gemini request failed" };
  }
}
