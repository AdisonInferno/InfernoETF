import { SUFFIX_BY_CCY, search, toXtb, toYahoo } from "@/lib/yahoo";
import { GoogleGenAI, Type } from "@google/genai";

// Reads a broker screenshot (XTB "Open positions" table) and returns the positions as JSON.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vision extraction wants the strongest model; override with GEMINI_IMPORT_MODEL in .env.local.
const MODEL = process.env.GEMINI_IMPORT_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
/** Free-tier quotas are per model: when one is exhausted (429) or unavailable (404), try the next. */
const FALLBACKS = [...new Set([MODEL, "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite"])];

function errInfo(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const code = Number((msg.match(/"code"\s*:\s*(\d{3})/) ?? [])[1] ?? (err as { status?: number })?.status ?? 0);
  const retry = Number((msg.match(/retry in ([\d.]+)s/i) ?? msg.match(/"retryDelay"\s*:\s*"(\d+)s"/) ?? [])[1] ?? 0);
  return { msg, code, retry };
}
const MAX_BYTES = 8 * 1024 * 1024;

const PROMPT = `You are a precise OCR + table extraction engine for a brokerage screenshot (usually XTB xStation, Polish or English UI).

Extract EVERY open position row from the table. One object per instrument row. If the same instrument appears in several rows
(several buys), output each row separately — do NOT merge them.

Rules:
- Copy numbers EXACTLY as shown. Never estimate, round, or compute a value that is not visible. If a cell is not visible, use null.
- Polish number format: "1 234,56" means 1234.56 (space = thousands separator, comma = decimal). Remove currency symbols and spaces.
- Negative numbers may be shown with "-" or in red; keep the sign.
- symbol: the ticker exactly as shown, including any suffix (e.g. "VWCE.DE", "NVDA.US", "CDR.PL", "CSPX.UK").
  XTB often shows ONLY the instrument name (e.g. "Intuitive Machines", "Lubawa", "Space Innovators"). Then set
  symbolShown=false and put your best exchange ticker in symbol (e.g. "LUNR", "LBW.PL", "RCAT", "KTOS", "SPOT", "MNST").
  ALWAYS add the XTB exchange suffix: Warsaw (GPW) companies → ".PL" (Budimex → "BDX.PL", CD Projekt → "CDR.PL",
  Orlen → "PKN.PL"; if unsure of the ticker keep the NAME exact — the app verifies every symbol against the exchange),
  US → ".US", Xetra → ".DE", London → ".UK", Amsterdam → ".NL", Paris → ".FR", Milan → ".IT".
  NEVER map a Polish / European company to a US ticker that merely shares the letters (Budimex is NOT Becton Dickinson "BDX").
  Never leave symbol empty. The name is the source of truth — copy it exactly.
- symbolShown: true only if the ticker itself is printed on screen.
- name: the instrument name exactly as shown (without the "Akcje"/"ETF" tag).
- quantity: the "Wolumen"/"Volume"/"Ilość" column (number of shares/units).
- avgOpenPrice: "Cena otwarcia"/"Open price".
- currentPrice: "Cena rynkowa"/"Market price"/"Bieżąca cena".
- marketValue: "Wartość"/"Market value"/"Wartość rynkowa" (in account currency).
- profit: "Zysk"/"Zysk netto"/"Profit"/"Gross profit" (in account currency).
- accountCurrency: the account currency shown on screen (e.g. "PLN", "EUR", "USD"), or null.
- sector: the GICS sector that best describes the company, or for a thematic ETF its dominant sector
  (defense / space / aerospace → "Industrials", quantum / semis / software → "Technology", smart grid → "Utilities").
- kind: "etf" if the row is tagged ETF/ETC/ETN, "stock" if tagged "Akcje"/"Stock" or otherwise.
- Column names in Polish XTB: "Wolumen" = quantity, "Wartość" = marketValue, "Aktualna cena" = currentPrice,
  "Cena otwarcia" = avgOpenPrice (can be 0.00, e.g. shares received from a spin-off — keep 0), "Zysk netto" = profit,
  "Zysk netto %" = profitPct.
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
          symbolShown: { type: Type.BOOLEAN },
          name: { type: Type.STRING, nullable: true },
          kind: { type: Type.STRING, enum: ["etf", "stock"] },
          sector: { type: Type.STRING, enum: ["Technology", "Communication", "Consumer Disc.", "Consumer Staples", "Health Care", "Financials", "Industrials", "Energy", "Utilities", "Materials", "Real Estate"] },
          quantity: { type: Type.NUMBER, nullable: true },
          avgOpenPrice: { type: Type.NUMBER, nullable: true },
          currentPrice: { type: Type.NUMBER, nullable: true },
          marketValue: { type: Type.NUMBER, nullable: true },
          profit: { type: Type.NUMBER, nullable: true },
          profitPct: { type: Type.NUMBER, nullable: true },
        },
        required: ["symbol", "symbolShown", "name", "kind", "sector", "quantity", "avgOpenPrice", "currentPrice", "marketValue", "profit"],
        propertyOrdering: ["name", "symbol", "symbolShown", "kind", "sector", "quantity", "avgOpenPrice", "currentPrice", "marketValue", "profit", "profitPct"],
      },
    },
  },
  required: ["positions", "accountCurrency", "totalMarketValue", "totalProfit"],
};

/* ── symbol verification (Yahoo): the screenshot NAME is the source of truth ── */
type P = { symbol: string; symbolShown?: boolean; name: string | null; kind: "etf" | "stock"; currentPrice: number | null; verified?: boolean; fixedFrom?: string; yahoo?: string; listedName?: string };
const YQ = process.env.YAHOO_BASE_URL ?? "https://query1.finance.yahoo.com";
const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b(s\.?a\.?|inc|corp|corporation|plc|ag|se|nv|ltd|co|company|holdings?|group|the|ucits|etf|acc|dist|usd|eur)\b/g, " ").split(/[^a-z0-9]+/).filter((w) => w.length > 1);
function nameSim(a: string, b: string) {
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w) || [...B].some((x) => x.startsWith(w) || w.startsWith(x))) hit++;
  return hit / Math.min(A.size, B.size);
}
async function meta(sym: string): Promise<{ name: string; price: number | null; currency: string; type: string } | null> {
  try {
    const r = await fetch(`${YQ}/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0 InfernoETF" }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const m = (await r.json())?.chart?.result?.[0]?.meta;
    if (!m) return null;
    const k = m.currency === "GBp" ? 0.01 : 1;
    return { name: m.longName ?? m.shortName ?? sym, price: typeof m.regularMarketPrice === "number" ? m.regularMarketPrice * k : null, currency: m.currency === "GBp" ? "GBP" : m.currency ?? "", type: m.instrumentType ?? "" };
  } catch { return null; }
}
const priceOk = (a: number | null, b: number | null) => a != null && b != null && b > 0 && Math.abs(a / b - 1) < 0.2;
async function resolveOne(p: P, acct: string | null): Promise<P> {
  if (!p.name) return p;
  const y = toYahoo(p.symbol.replace(/\.US$/i, ""));
  const m = await meta(y);
  if (m && (nameSim(p.name, m.name) >= 0.5 || priceOk(m.price, p.currentPrice))) return { ...p, verified: true, yahoo: y, listedName: m.name };
  // wrong / unknown ticker → search by the NAME shown on screen, prefer the listing in the account's market
  const pref = SUFFIX_BY_CCY[acct ?? ""] ?? [];
  const hits = (await search(p.name)).map((h) => ({ h, sim: nameSim(p.name!, h.name), local: pref.some((sfx) => (sfx ? h.symbol.endsWith(sfx) : !h.symbol.includes("."))) }))
    .filter((x) => x.sim >= 0.5).sort((a, b) => Number(b.local) - Number(a.local) || b.sim - a.sim).slice(0, 4);
  for (const { h } of hits) {
    const mm = await meta(h.symbol);
    if (!mm) continue;
    if (p.currentPrice == null || priceOk(mm.price, p.currentPrice) || hits.length === 1)
      return { ...p, symbol: toXtb(h.symbol), verified: true, fixedFrom: p.symbol, yahoo: h.symbol, listedName: mm.name, kind: h.type === "ETF" ? "etf" : p.kind };
  }
  return { ...p, verified: false };
}
async function resolveAll(list: P[], acct: string | null): Promise<P[]> {
  const out: P[] = [];
  for (let i = 0; i < list.length; i += 4) out.push(...(await Promise.all(list.slice(i, i + 4).map((p) => resolveOne(p, acct)))));
  return out;
}

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

  let quota = 0, maxRetry = 0, busy = 0, last = "";
  for (const model of FALLBACKS) for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: file.type, data } }, { text: PROMPT }] }],
        config: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
      });
      const json = JSON.parse(res.text ?? "{}");
      // Verify every symbol against the exchange (name + price), and fix it by NAME search when it doesn't match.
      if (Array.isArray(json.positions)) json.positions = await resolveAll(json.positions, json.accountCurrency ?? null);
      return Response.json({ ...json, model });
    } catch (err) {
      const e = errInfo(err);
      last = e.msg;
      if (e.code === 429) { quota++; maxRetry = Math.max(maxRetry, e.retry); break; } // daily limit of this model → next one
      if (e.code === 404 || e.code === 400 && /model/i.test(e.msg)) break; // model not available for this key
      // overloaded / temporary server error → wait a moment, retry once, then try the next model
      if (e.code === 503 || e.code === 500 || e.code === 504 || /UNAVAILABLE|overloaded|high demand/i.test(e.msg)) {
        busy++;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      return Response.json({ error: `Błąd modelu (${model}): ${e.msg.slice(0, 300)}` }, { status: 502 });
    }
  }
  if (busy && !quota) {
    return Response.json({ error: "Serwery Gemini są teraz przeciążone (próbowałem kilku modeli). To chwilowe — spróbuj ponownie za 1–2 minuty." }, { status: 503 });
  }
  if (quota) {
    const h = maxRetry ? Math.ceil(maxRetry / 3600) : null;
    return Response.json({
      error: `Dzienny darmowy limit Gemini wyczerpany na wszystkich dostępnych modelach${h ? ` — odnowi się za ok. ${h} godz.` : "."} ` +
        "Na stałe: włącz płatny plan w Google AI Studio (aistudio.google.com → Get API key → Set up billing).",
    }, { status: 429 });
  }
  return Response.json({ error: `Brak dostępnego modelu Gemini dla tego klucza. ${last.slice(0, 200)}` }, { status: 502 });
}
