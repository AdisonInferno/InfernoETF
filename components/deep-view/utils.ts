export const sg = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
export const usd = (v: number) => "$" + v.toFixed(2);
export const aumFmt = (v: number) => (v >= 1 ? "$" + (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + "B" : "$" + Math.round(v * 1000) + "M");

export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash01(str: string) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export interface Rect<T> { item: T; x: number; y: number; w: number; h: number }

/** Balanced binary-split treemap (tile area ∝ weight). */
export function binaryTreemap<T>(items: T[], weight: (t: T) => number, x: number, y: number, w: number, h: number, out: Rect<T>[] = []): Rect<T>[] {
  if (!items.length) return out;
  if (items.length === 1) { out.push({ item: items[0], x, y, w, h }); return out; }
  const total = items.reduce((a, z) => a + weight(z), 0);
  let acc = 0, k = 1;
  for (let i = 0; i < items.length - 1; i++) { acc += weight(items[i]); k = i + 1; if (acc >= total / 2) break; }
  const A = items.slice(0, k), B = items.slice(k);
  const sa = A.reduce((a, z) => a + weight(z), 0) / total;
  if (w >= h) { binaryTreemap(A, weight, x, y, w * sa, h, out); binaryTreemap(B, weight, x + w * sa, y, w * (1 - sa), h, out); }
  else { binaryTreemap(A, weight, x, y, w, h * sa, out); binaryTreemap(B, weight, x, y + h * sa, w, h * (1 - sa), out); }
  return out;
}

/** Squarified treemap (Bruls et al.) — used for sector / sub-sector breakdown. */
export function squarify<T>(items: T[], value: (t: T) => number, x: number, y: number, w: number, h: number): Rect<T>[] {
  const res: Rect<T>[] = [];
  const sc = (w * h) / items.reduce((t, i) => t + value(i), 0);
  let arr = items.slice();
  const worst = (r: T[], sh: number) => {
    const S = r.reduce((t, i) => t + value(i) * sc, 0);
    const mx = Math.max(...r.map((i) => value(i) * sc)), mn = Math.min(...r.map((i) => value(i) * sc));
    return Math.max((sh * sh * mx) / (S * S), (S * S) / (sh * sh * mn));
  };
  while (arr.length) {
    const sh = Math.min(w, h);
    const row = [arr[0]];
    let k = 1;
    while (k < arr.length && worst(row.concat(arr[k]), sh) <= worst(row, sh)) { row.push(arr[k]); k++; }
    arr = arr.slice(k);
    const S = row.reduce((t, i) => t + value(i) * sc, 0);
    if (w >= h) {
      const cw = S / h; let yy = y;
      row.forEach((i) => { const ch = (value(i) * sc) / cw; res.push({ item: i, x, y: yy, w: cw, h: ch }); yy += ch; });
      x += cw; w -= cw;
    } else {
      const rh = S / w; let xx = x;
      row.forEach((i) => { const cw = (value(i) * sc) / rh; res.push({ item: i, x: xx, y, w: cw, h: rh }); xx += cw; });
      y += rh; h -= rh;
    }
  }
  return res;
}

export const pctOf = (v: number, total: number) => ((v / total) * 100).toFixed(3) + "%";

/** Map an offset (0..1 over 5Y) to "YYYY-MM". */
export const rangeDate = (f: number) => {
  const m = Math.round(f * 60) + 8;
  return 2021 + Math.floor(m / 12) + "-" + String((m % 12) + 1).padStart(2, "0");
};
