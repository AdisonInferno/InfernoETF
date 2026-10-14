/* Server-only: "What is the market waiting for?" — upcoming events ranked by expected market impact.
 *
 * v1 scoring (free data only, to be refined):
 *   EARNINGS  impact = how much of the market the company IS:
 *               · size        market cap (log-scaled, $4.5T ≈ max)          55%
 *               · index pull  weight in the S&P 500                          25%
 *               · ETF reach   how many ETFs in our database hold it          20%
 *   MACRO     fixed weights from how much these releases historically move the S&P
 *             (FOMC > CPI > NFP > PCE > GDP …).
 *   Later: options-implied move and historical earnings-day reaction (needs price/options data). */

import { PROFILE_OF } from "@/lib/fund-profiles";
import type { CalEvent } from "./calendar";

export interface Awaited extends CalEvent {
  score: number; // 0–100
  weight: number; // 1–5
  why: string;
  /** ETFs most exposed (earnings only) */
  etfs?: string[];
}

const MACRO: Record<string, [number, string]> = {
  FOMC: [96, "Fed rate decision — repricing of every asset"],
  CPI: [90, "Inflation print — drives rate expectations"],
  NFP: [84, "Jobs report — growth + rate expectations"],
  PCE: [70, "Fed's preferred inflation gauge"],
  GDP: [60, "Growth estimate"],
  PPI: [55, "Producer inflation — CPI lead"],
  RETAIL: [55, "Consumer demand"],
  QUAD: [48, "Quad witching — heavy options/futures expiry flows"],
  OPEX: [30, "Monthly options expiry"],
};

/* ticker → { capB, S&P weight, ETFs holding it (with weight) } from our fund profiles */
interface Exp { capB: number; spw: number; etfs: [string, number][] }
let EXP: Map<string, Exp> | null = null;
function exposure(): Map<string, Exp> {
  if (EXP) return EXP;
  const m = new Map<string, Exp>();
  for (const [etf, prof] of Object.entries(PROFILE_OF)) {
    for (const line of prof?.holdings ?? []) {
      const [t, , w, , cap] = line.split("|");
      const x = m.get(t) ?? { capB: 0, spw: 0, etfs: [] };
      x.capB = Math.max(x.capB, Number(cap) || 0);
      x.etfs.push([etf, Number(w) || 0]);
      if (etf === "SPY" || etf === "VOO" || etf === "IVV") x.spw = Math.max(x.spw, Number(w) || 0);
      m.set(t, x);
    }
  }
  return (EXP = m);
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const fmtCap = (b: number) => (b >= 1000 ? `$${(b / 1000).toFixed(1)}T` : `$${Math.round(b)}B`);

export function rankAwaited(events: CalEvent[], limit = 10): Awaited[] {
  const ex = exposure();
  const maxReach = Math.max(1, ...[...ex.values()].map((x) => x.etfs.length));
  const out: Awaited[] = [];
  for (const e of events) {
    if (e.source === "EARN") {
      const x = ex.get(e.code);
      if (!x) { out.push({ ...e, score: 12, weight: 1, why: "Small/unknown weight in tracked ETFs" }); continue; }
      const size = clamp01(Math.log10(Math.max(1, x.capB)) / Math.log10(4500));
      const pull = clamp01(x.spw / 6);
      const reach = clamp01(x.etfs.length / maxReach);
      const score = Math.round(100 * (0.55 * size ** 2 + 0.25 * pull + 0.2 * reach));
      const top = [...x.etfs].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
      out.push({
        ...e, score, weight: Math.max(1, Math.ceil(score / 20)), etfs: top,
        why: [x.capB ? `cap ${fmtCap(x.capB)}` : "", x.spw ? `${x.spw.toFixed(1)}% of S&P` : "", `in ${x.etfs.length} ETFs`].filter(Boolean).join(" · "),
      });
    } else {
      const m = MACRO[e.code];
      if (!m) continue; // market holidays etc. are not "awaited"
      out.push({ ...e, score: m[0], weight: Math.max(1, Math.ceil(m[0] / 20)), why: m[1] });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.at.localeCompare(b.at)).slice(0, limit);
}
