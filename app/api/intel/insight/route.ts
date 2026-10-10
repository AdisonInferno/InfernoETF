import { insightFor } from "@/lib/intel/filing-insight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMS = new Set(["4", "8-K", "10-Q", "10-K", "6-K", "20-F"]);

/** GET /api/intel/insight?ticker=NVDA&cik=1045810&acc=0001045810-26-000123&form=4&doc=xslF345X05/form4.xml&items=
    Only builds sec.gov URLs from validated parts — never fetches an arbitrary URL. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const cik = Number(p.get("cik"));
  const acc = p.get("acc") ?? "", form = p.get("form") ?? "", doc = p.get("doc") ?? "";
  if (!Number.isInteger(cik) || cik <= 0 || !/^\d{10}-\d{2}-\d{6}$/.test(acc) || !FORMS.has(form) || !/^[\w./-]{1,120}$/.test(doc) || doc.includes("..")) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const insight = await insightFor({ ticker: (p.get("ticker") ?? "").toUpperCase().slice(0, 8), cik, form, accession: acc, doc, items: (p.get("items") ?? "").slice(0, 60) });
  return Response.json(insight, { headers: { "Cache-Control": "private, max-age=600" } });
}
