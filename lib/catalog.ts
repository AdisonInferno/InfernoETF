/* Instrument catalog for search / autocomplete: every ETF in the database + every stock held in a fund profile.
   Pure data (no fetch) — safe on server and client. */

import { ETFS } from "@/lib/etfs";
import { PROFILE_OF } from "@/lib/fund-profiles";

export interface Instrument { sym: string; label: string; name: string; kind: "ETF" | "STOCK" }

export const CATALOG: Instrument[] = (() => {
  const out = new Map<string, Instrument>();
  for (const e of ETFS) out.set(e.ticker, { sym: e.ticker, label: e.ticker, name: e.name, kind: "ETF" });
  for (const prof of new Set(Object.values(PROFILE_OF))) {
    for (const line of prof.holdings) {
      const [t, name] = line.split("|");
      // holdings with exchange-less non-US codes ("RR.", "BA.") have no usable price symbol — skip them
      if (!t || t.endsWith(".") || out.has(t)) continue;
      out.set(t, { sym: t, label: t, name, kind: "STOCK" });
    }
  }
  return [...out.values()];
})();

/** Ticker-prefix matches first, then ticker / name substring matches. */
export function searchCatalog(q: string, limit = 12): Instrument[] {
  const n = q.trim().toUpperCase();
  if (!n) return [];
  const score = (i: Instrument) => (i.sym === n ? 0 : i.sym.startsWith(n) ? 1 : i.sym.includes(n) ? 2 : i.name.toUpperCase().includes(n) ? 3 : 9);
  return CATALOG.map((i) => [score(i), i] as const).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0] || a[1].sym.localeCompare(b[1].sym)).slice(0, limit).map(([, i]) => i);
}
