import type { Tf, TfDef } from "./types";
import { seeded } from "./utils";

export const TF: Record<Tf, TfDef> = {
  "1D":  { points: 78,  changePct: 1.37,   vol: 0.006, axis: ["09:30", "11:00", "12:30", "14:00", "16:00"] },
  "1W":  { points: 70,  changePct: 2.14,   vol: 0.014, axis: ["MON", "TUE", "WED", "THU", "FRI"] },
  "2W":  { points: 70,  changePct: 1.86,   vol: 0.02,  axis: ["SEP 14", "SEP 17", "SEP 22", "SEP 25"] },
  "1M":  { points: 66,  changePct: -3.42,  vol: 0.03,  axis: ["AUG 28", "SEP 04", "SEP 11", "SEP 18", "SEP 25"] },
  "3M":  { points: 90,  changePct: 6.9,    vol: 0.04,  axis: ["JUL 01", "JUL 29", "AUG 26", "SEP 25"] },
  "YTD": { points: 140, changePct: 28.61,  vol: 0.05,  axis: ["JAN", "MAR", "MAY", "JUL", "SEP"] },
  "1Y":  { points: 150, changePct: 41.18,  vol: 0.06,  axis: ["OCT '25", "JAN '26", "APR", "JUL", "SEP"] },
  "3Y":  { points: 165, changePct: 78.3,   vol: 0.085, axis: ["OCT '23", "2024", "2025", "2026"] },
  "5Y":  { points: 180, changePct: 212.4,  vol: 0.1,   axis: ["2021", "2022", "2023", "2024", "2025", "2026"] },
};
export const TF_KEYS = Object.keys(TF) as Tf[];

/** Default RANGE-slider window (fractions of the 5Y series) per timeframe. */
export const BRUSH_PRESET: Record<Tf, [number, number]> = {
  "1D": [0.998, 1], "1W": [0.995, 1], "2W": [0.99, 1], "1M": [0.983, 1], "3M": [0.95, 1],
  "YTD": [0.855, 1], "1Y": [0.8, 1], "3Y": [0.4, 1], "5Y": [0, 1],
};

/** Placeholder price series (seeded random walk). Replace with real history from your API. */
export function makeSeries(tf: Tf, endPx: number, chg: number = TF[tf].changePct, seedKey = "", volMul = 1): number[] {
  const { points: n } = TF[tf];
  const vol = TF[tf].vol * volMul;
  let seed = 0;
  for (const ch of seedKey + tf) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = seeded(seed);
  const w = [0];
  for (let i = 1; i < n; i++) w.push(w[i - 1] + (rnd() - 0.5) * (rnd() < 0.08 ? 3 : 1));
  const start = endPx / (1 + chg / 100), sd = Math.sqrt(n) * 0.35;
  return w.map((v, i) => { const f = i / (n - 1); return start * (1 + (chg / 100) * f) + ((v - f * w[n - 1]) / sd) * vol * start; });
}

/** Cap-weighted vs equal-weighted index, rebased to 100 (130 points). */
export const BREADTH = (() => {
  const rnd = seeded(9127);
  const S = [100], E = [100];
  for (let i = 1; i < 130; i++) {
    const m = (rnd() - 0.5) * 0.05 - (i > 12 && i < 40 ? 0.004 : 0);
    S.push(S[i - 1] * (1 + 0.0062 + m + (rnd() - 0.5) * 0.01));
    E.push(E[i - 1] * (1 + 0.0038 + m * 0.92 + (rnd() - 0.5) * 0.012));
  }
  return { S, E };
})();

export const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export const COUNTRY_CODE: Record<string, string> = {
  "United States": "us", Taiwan: "tw", Netherlands: "nl", Switzerland: "ch", Germany: "de",
  Japan: "jp", China: "cn", "United Kingdom": "gb", "South Korea": "kr",
  Ireland: "ie", France: "fr", Canada: "ca", India: "in", Brazil: "br", Australia: "au", Denmark: "dk",
  Sweden: "se", Italy: "it", Spain: "es", Israel: "il", Poland: "pl", Kazakhstan: "kz", "Saudi Arabia": "sa",
};
