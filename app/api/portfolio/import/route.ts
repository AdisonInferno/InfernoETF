import { GoogleGenAI, Type } from "@google/genai";

// Reads a broker screenshot (XTB "Open positions" table) and returns the positions as JSON.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vision extraction wants the strongest model; override with GEMINI_IMPORT_MODEL in .env.local.
const MODEL = process.env.GEMINI_IMPORT_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
const MAX_BYTES = 8 * 1024 * 1024;

const PROMPT = `You are a precise OCR + table extraction engine for a brokerage screenshot (usually XTB xStation, Polish or English UI).

Extract EVERY open position row from the table. One object per instrument row. If the same instrument appears in several rows
(several buys), output each row separately — do NOT merge them.

Rules:
- Copy numbers EXACTLY as shown. Never estimate, round, or compute a value that is not visible. If a cell is not visible, use null.
- Polish number format: "1 234,56" means 1234.56 (space = thousands separator, comma = decimal). Remove currency symbols and spaces.
- Negative numbers may be shown with "-" or in red; keep the sign.
- symbol: the ticker exactly as shown, including any suffix (e.g. "VWCE.DE", "NVDA.US", "CDR.PL", "CSPX.UK").
- name: the full instrument name if visible, else null.
- quantity: the "Wolumen"/"Volume"/"Ilość" column (number of shares/units).
- avgOpenPrice: "Cena otwarcia"/"Open price".
- currentPrice: "Cena rynkowa"/"Market price"/"Bieżąca cena".
- marketValue: "Wartość"/"Market value"/"Wartość rynkowa" (in account currency).
- profit: "Zysk"/"Zysk netto"/"Profit"/"Gross profit" (in account currency).
- accountCurrency: the account currency shown on screen (e.g. "PLN", "EUR", "USD"), or null.
- kind: "etf" if the instrument is an ETF/ETC/ETN, otherwise "stock".
- totalMarketValue / totalProfit: the totals/summary row or account summary if visible, else null.
- Ignore pending orders, closed positions, cash balance rows, headers and footers.
- If the image is not a positions table, return an empty positions array.`;

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    accountCurrency: { type: Type.STRING, nullable: true },
    totalMarketValue: { type: Type.NUMBER, nullable: true },
    totalProfit: { type: Type.NUMBER, nullable: true },
    positions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          symbol: { type: Type.STRING },
          name: { type: Type.STRING, nullable: true },
          kind: { type: Type.STRING, enum: ["etf", "stock"] },
          quantity: { type: Type.NUMBER, nullable: true },
          avgOpenPrice: { type: Type.NUMBER, nullable: true },
          currentPrice: { type: Type.NUMBER, nullable: true },
          marketValue: { type: Type.NUMBER, nullable: true },
          profit: { type: Type.NUMBER, nullable: true },
        },
        required: ["symbol", "kind", "quantity", "avgOpenPrice", "currentPrice", "marketValue", "profit"],
        propertyOrdering: ["symbol", "name", "kind", "quantity", "avgOpenPrice", "currentPrice", "marketValue", "profit"],
      },
    },
  },
  required: ["positions", "accountCurrency", "totalMarketValue", "totalProfit"],
};

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: "Brak GEMINI_API_KEY w .env.local." }, { status: 500 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("image");
    file = f instanceof File ? f : null;
  } catch {
    /* handled below */
  }
  if (!file) return Response.json({ error: "Brak obrazka." }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "To nie jest obrazek." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Obrazek jest większy niż 8 MB." }, { status: 400 });

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const ai = new GoogleGenAI({ apiKey });

  try {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: file.type, data } }, { text: PROMPT }] }],
      config: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
    });
    const json = JSON.parse(res.text ?? "{}");
    return Response.json({ ...json, model: MODEL });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Błąd modelu: ${msg}` }, { status: 502 });
  }
}
