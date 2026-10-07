import { GoogleGenAI } from "@google/genai";

// The SDK needs Node APIs, and every request must hit the API fresh.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Default model; override with GEMINI_MODEL in .env.local (e.g. gemini-3.5-flash-lite = cheaper).
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

const SYSTEM_PROMPT = `You are the INFERNO ETF assistant. You help users understand ETFs:
how they work, costs (TER/expense ratio), diversification, sectors, providers and risk.
Answer in the user's language (Polish if they write in Polish). Be concise and concrete.
You do not give personalised investment advice: explain facts and trade-offs and remind
users that the final decision is theirs.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

function isChatMessage(m: unknown): m is ChatMessage {
  if (typeof m !== "object" || m === null) return false;
  const r = m as Record<string, unknown>;
  return (r.role === "user" || r.role === "assistant") && typeof r.content === "string" && r.content.trim() !== "";
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Brak GEMINI_API_KEY w .env.local (zrestartuj `npm run dev` po dodaniu klucza)." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Nieprawidłowy JSON." }, { status: 400 });
  }

  const raw = (body as { messages?: unknown })?.messages;
  const messages = Array.isArray(raw) ? raw.filter(isChatMessage).slice(-20) : [];
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "Brak wiadomości użytkownika." }, { status: 400 });
  }

  // Gemini calls the assistant role "model".
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const ai = new GoogleGenAI({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const response = await ai.models.generateContentStream({
          model: MODEL,
          contents,
          config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 2048 },
        });
        for await (const chunk of response) {
          const text = chunk.text;
          if (text) controller.enqueue(encoder.encode(text));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`\n\n[Błąd API: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
