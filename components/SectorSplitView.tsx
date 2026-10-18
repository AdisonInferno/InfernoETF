"use client";

/* ─────────────────────────────────────────────────────────────
   SECTOR SPLIT — master / detail
   Left  (50%): ETFs of one sub-sector (e.g. AI & ROBOTICS) — ticker · name · AUM · 1M · YTD.
                Row click = active asset.
   Right (50%): insight cockpit for the active ETF vs its parent-sector benchmark (e.g. BOTZ vs XLK):
                header (ticker · live price · [ BENCHMARK ]), relative-performance chart (ETF solid,
                benchmark dashed + muted), insight blocks (beta, spread, correlation, top holding).
   Prices: /api/prices + /api/quotes (Yahoo); deterministic model data when those are unreachable
   (beta-linked to the benchmark so the comparison still behaves sensibly) — flagged MODEL DATA.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { buildFund } from "@/components/deep-view/buildFund";
import { CATEGORIES, ETFS, SUBCATEGORIES, fmtAum, type CategoryId } from "@/lib/etfs";
import { QUOTE } from "@/lib/fund-profiles";

const MONO = "font-mono";
const B = "border-white/[0.05]";

/** Parent benchmark per category */
const BENCH: Record<CategoryId, { sym: string; label: string }> = {
  indexes: { sym: "ACWI", label: "ACWI GLOBAL EQUITY" },
  "ai-tech": { sym: "XLK", label: "XLK BROAD TECH" },
  defense: { sym: "ITA", label: "ITA AEROSPACE & DEFENSE" },
  commodities: { sym: "DBC", label: "DBC BROAD COMMODITIES" },
  energy: { sym: "XLE", label: "XLE BROAD ENERGY" },
  financials: { sym: "XLF", label: "XLF BROAD FINANCIALS" },
  industry: { sym: "XLI", label: "XLI BROAD INDUSTRIALS" },
  others: { sym: "SPY", label: "SPY S&P 500" },
} as Record<CategoryId, { sym: string; label: string }>;

const WINDOWS = [["1M", "1mo"], ["3M", "3mo"], ["YTD", "ytd"], ["1Y", "1y"]] as const;
type Win = (typeof WINDOWS)[number][1];
type Raw = { t: number[]; c: number[] };

const sgn = (v: number, d = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}%`;
const tone = (v: number) => (v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-400");

/* ── model data: benchmark walk + ETF = β·benchmark + own noise (same seed → stable) ── */
function seeded(key: string) {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = (Math.imul(h, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const ytdDays = () => Math.max(5, Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 1)) / 864e5));
const N: Record<Win, () => number> = { "1mo": () => 30, "3mo": () => 91, ytd: ytdDays, "1y": () => 365 };
function modelPair(etf: string, bench: string, win: Win, beta: number): { a: Raw; b: Raw } {
  const n = N[win](), end = Math.floor(Date.now() / 1000 / 86400) * 86400;
  const rb = seeded(bench + win), ra = seeded(etf + win);
  const t: number[] = [], cb: number[] = [], ca: number[] = [];
  let pb = 100, pa = 100;
  for (let i = 0; i < n; i++) {
    const mb = (rb() - 0.47) * 0.022;
    const ma = beta * mb + (ra() - 0.49) * 0.014;
    pb *= 1 + mb; pa *= 1 + ma;
    t.push(end - (n - 1 - i) * 86400); cb.push(pb); ca.push(pa);
  }
  return { a: { t, c: ca }, b: { t, c: cb } };
}

/** Daily returns of a aligned to b's timestamps (forward-filled) → beta, correlation */
function stats(a: Raw, b: Raw) {
  const at = (s: Raw, t: number) => { let k = 0; while (k + 1 < s.t.length && s.t[k + 1] <= t) k++; return s.c[k]; };
  const ra: number[] = [], rb: number[] = [];
  for (let i = 1; i < b.t.length; i++) { ra.push(at(a, b.t[i]) / at(a, b.t[i - 1]) - 1); rb.push(b.c[i] / b.c[i - 1] - 1); }
  const m = (x: number[]) => x.reduce((s, v) => s + v, 0) / (x.length || 1);
  const ma = m(ra), mb = m(rb);
  let cov = 0, va = 0, vb = 0;
  ra.forEach((v, i) => { cov += (v - ma) * (rb[i] - mb); va += (v - ma) ** 2; vb += (rb[i] - mb) ** 2; });
  return { beta: vb ? cov / vb : 1, corr: va && vb ? cov / Math.sqrt(va * vb) : 0 };
}

/* ── relative performance chart (SVG) ── */
function RelChart({ a, b, labelA, labelB }: { a: Raw; b: Raw; labelA: string; labelB: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const pa = a.c.map((v) => (v / a.c[0] - 1) * 100);
  const pbAt = (t: number) => { let k = 0; while (k + 1 < b.t.length && b.t[k + 1] <= t) k++; return (b.c[k] / b.c[0] - 1) * 100; };
  const pb = a.t.map(pbAt);
  const all = [...pa, ...pb, 0], lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.08 || 1;
  const W = 1000, H = 300;
  const x = (i: number) => (i / (pa.length - 1)) * W;
  const y = (v: number) => H - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * H;
  const path = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const i = hover ?? pa.length - 1;
  const fmtD = (t: number) => new Date(t * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (a.t.length - 1)));
  return (
    <div className={`${MONO} flex h-full min-h-0 flex-col`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-1.5 text-[10.5px] tabular-nums">
        <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 bg-emerald-400" /><span className="text-zinc-200">{labelA}</span><span className={tone(pa[i])}>{sgn(pa[i])}</span></span>
        <span className="flex items-center gap-1.5 opacity-70"><span className="w-4 border-t border-dashed border-zinc-300" /><span className="text-zinc-400">{labelB}</span><span className={tone(pb[i])}>{sgn(pb[i])}</span></span>
        <span className="ml-auto text-zinc-600">{fmtD(a.t[i])}</span>
      </div>
      <div className="relative min-h-0 flex-1 cursor-crosshair"
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(pa.length - 1, Math.round(((e.clientX - r.left) / r.width) * (pa.length - 1))))); }}
        onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.12)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          {/* spread fill between the two lines */}
          <path d={`${path(pa)} ${pb.map((v, k) => `L${x(pb.length - 1 - k).toFixed(1)},${y(pb[pb.length - 1 - k]).toFixed(1)}`).join(" ")} Z`} fill={pa[pa.length - 1] >= pb[pb.length - 1] ? "rgba(52,211,153,0.06)" : "rgba(244,63,94,0.06)"} />
          <path d={path(pb)} fill="none" stroke="var(--color-zinc-300)" strokeOpacity={0.4} strokeWidth={1.2} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <path d={path(pa)} fill="none" stroke="#34d399" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {hover !== null && <div className="pointer-events-none absolute inset-y-0 w-px bg-white/20" style={{ left: `${(x(i) / W) * 100}%` }} />}
        <span className="pointer-events-none absolute right-1 text-[9.5px] text-zinc-600" style={{ top: `${(y(0) / H) * 100}%`, transform: "translateY(-120%)" }}>0%</span>
      </div>
      <div className="flex justify-between px-1 pt-1 text-[9.5px] tracking-[0.06em] text-zinc-600">
        {ticks.map((k, j) => <span key={j}>{fmtD(a.t[k])}</span>)}
      </div>
    </div>
  );
}

export default function SectorSplitView() {
  const cats = CATEGORIES.filter((c) => c.id !== "all" && c.id !== "trending" && SUBCATEGORIES[c.id as CategoryId]?.length) as { id: CategoryId; label: string }[];
  const [cat, setCat] = useState<CategoryId>("ai-tech");
  const subs = SUBCATEGORIES[cat] ?? [];
  const [subId, setSubId] = useState<string>("ai-infra");
  const sub = subs.find((s) => s.id === subId) ?? subs[0];
  const bench = BENCH[cat] ?? BENCH.others;

  const rows = (sub?.tickers ?? []).map((t) => {
    const e = ETFS.find((x) => x.ticker === t);
    if (!e) return null;
    const f = buildFund(t);
    return { ticker: t, name: e.name, aum: e.aum, m1: f?.perf["1M"] ?? e.ytd / 9, ytd: e.ytd, fund: f };
  }).filter((r): r is NonNullable<typeof r> => !!r);

  const [active, setActive] = useState<string | null>(null);
  const act = rows.find((r) => r.ticker === active) ?? rows[0] ?? null;
  const [win, setWin] = useState<Win>("ytd");

  const pickCat = (c: CategoryId) => { setCat(c); setSubId(SUBCATEGORIES[c]?.[0]?.id ?? ""); setActive(null); };

  /* history: active ETF + benchmark */
  const key = act ? `${act.ticker}|${bench.sym}|${win}` : "";
  const [hist, setHist] = useState<{ key: string; a: Raw; b: Raw; model: boolean } | null>(null);
  const actTic = act?.ticker ?? null, actBeta = act?.fund?.stats.beta ?? 1.1;
  useEffect(() => {
    if (!actTic) return;
    let off = false;
    fetch(`/api/prices?symbols=${actTic},${bench.sym}&range=${win}`)
      .then((r) => r.json())
      .then((j: { series?: Record<string, Raw | null> }) => {
        const a = j.series?.[actTic], b = j.series?.[bench.sym];
        if (off) return;
        if (a && b && a.c.length > 2 && b.c.length > 2) setHist({ key, a, b, model: false });
        else setHist({ key, ...modelPair(actTic, bench.sym, win, actBeta), model: true });
      })
      .catch(() => { if (!off) setHist({ key, ...modelPair(actTic, bench.sym, win, actBeta), model: true }); });
    return () => { off = true; };
  }, [key, actTic, actBeta, bench.sym, win]);
  const h = hist?.key === key ? hist : null;

  /* live price */
  const [quote, setQuote] = useState<{ t: string; price: number; chg: number } | null>(null);
  useEffect(() => {
    if (!actTic) return;
    let off = false;
    fetch(`/api/quotes?symbols=${actTic}`).then((r) => r.json())
      .then((j) => { const q = j.quotes?.[actTic]; if (!off && q) setQuote({ t: actTic, price: q.price, chg: q.chg }); })
      .catch(() => {});
    return () => { off = true; };
  }, [actTic]);
  const live = quote?.t === act?.ticker ? quote : null;
  const price = live?.price ?? (act ? QUOTE[act.ticker]?.[0] : undefined);

  const st = h ? stats(h.a, h.b) : null;
  const retA = h ? (h.a.c[h.a.c.length - 1] / h.a.c[0] - 1) * 100 : null;
  const retB = h ? (h.b.c[h.b.c.length - 1] / h.b.c[0] - 1) * 100 : null;
  const spread = retA != null && retB != null ? retA - retB : null;
  const top = act?.fund?.holdings[0];

  const chip = (on: boolean) => `h-7 rounded-sm border px-2.5 text-[10.5px] font-bold tracking-[0.08em] transition-colors ${on ? "oasis-on" : `${B} text-zinc-500 hover:text-zinc-200`}`;
  const winLabel = WINDOWS.find(([, v]) => v === win)?.[0];

  return (
    <div className={`${MONO} flex min-h-0 flex-1 flex-col gap-3 bg-[var(--oasis-bg)]`}>
      {/* sector / sub-sector selectors */}
      <div className={`oasis-glass flex flex-wrap items-center gap-1.5 border ${B} bg-[var(--oasis-panel)] px-3 py-2`}>
        <span className="mr-1 text-[9.5px] font-semibold tracking-[0.14em] text-zinc-600">SECTOR</span>
        {cats.map((c) => <button key={c.id} type="button" onClick={() => pickCat(c.id)} className={chip(cat === c.id)}>{c.label}</button>)}
        <span className={`mx-2 h-5 w-px bg-white/[0.08]`} />
        <span className="mr-1 text-[9.5px] font-semibold tracking-[0.14em] text-zinc-600">SUB-SECTOR</span>
        {subs.map((s) => <button key={s.id} type="button" onClick={() => { setSubId(s.id); setActive(null); }} className={chip(sub?.id === s.id)}>{s.label}</button>)}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 max-lg:grid-cols-1">
        {/* ── MASTER ── */}
        <section className={`oasis-glass flex min-h-0 flex-col overflow-hidden border ${B} bg-[var(--oasis-panel)]`}>
          <header className={`flex items-center justify-between border-b ${B} px-3 py-2`}>
            <span className="text-[11px] font-bold tracking-[0.14em] text-zinc-200">[ {sub?.label ?? "—"} ]</span>
            <span className="text-[9.5px] tracking-[0.12em] text-zinc-600">{rows.length} ETF · CLICK A ROW</span>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full table-fixed border-collapse text-[12px] tabular-nums">
              <colgroup><col className="w-[86px]" /><col /><col className="w-[96px]" /><col className="w-[86px]" /><col className="w-[86px]" /></colgroup>
              <thead className="sticky top-0 bg-[var(--oasis-panel)]">
                <tr className={`border-b ${B} text-[9.5px] tracking-[0.14em] text-zinc-600`}>
                  <th className="py-2 pl-3 text-left font-semibold">TICKER</th>
                  <th className="py-2 text-left font-semibold">NAME</th>
                  <th className="py-2 text-right font-semibold">AUM</th>
                  <th className="py-2 text-right font-semibold">1M</th>
                  <th className="py-2 pr-3 text-right font-semibold">YTD</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const on = act?.ticker === r.ticker;
                  return (
                    <tr key={r.ticker} onClick={() => setActive(r.ticker)} aria-selected={on}
                      className={`cursor-pointer border-b ${B} transition-colors ${on ? "bg-oasis-muted" : "hover:bg-white/[0.03]"}`}>
                      <td className={`py-2.5 pl-3 font-bold ${on ? "border-l-2 border-oasis pl-[10px] text-oasis" : "border-l-2 border-transparent text-zinc-200"}`}>{r.ticker}</td>
                      <td className="truncate py-2.5 pr-2 font-sans text-[12px] text-zinc-400" title={r.name}>{r.name}</td>
                      <td className="py-2.5 text-right text-zinc-300">{fmtAum(r.aum)}</td>
                      <td className={`py-2.5 text-right font-bold ${tone(r.m1)}`}>{sgn(r.m1, 1)}</td>
                      <td className={`py-2.5 pr-3 text-right font-bold ${tone(r.ytd)}`}>{sgn(r.ytd, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && <p className="m-0 p-4 text-[11px] text-zinc-600">No ETFs in this sub-sector.</p>}
          </div>
        </section>

        {/* ── DETAIL ── */}
        <section className={`oasis-glass flex min-h-[520px] flex-col overflow-hidden border ${B} bg-[var(--oasis-panel)]`}>
          {act ? (
            <>
              <header className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b ${B} px-3 py-2.5`}>
                <span className="text-[20px] font-bold leading-none text-zinc-50">{act.ticker}</span>
                <span className="text-[16px] font-semibold tabular-nums text-zinc-100">{price != null ? `$${price.toFixed(2)}` : "—"}</span>
                {live && <span className={`text-[12px] font-bold tabular-nums ${tone(live.chg)}`}>{sgn(live.chg)}</span>}
                <span className={`rounded-xs border ${B} bg-[var(--oasis-bg)] px-2 py-0.5 text-[10px] font-bold tracking-[0.1em] text-zinc-400`}>[ BENCHMARK: {bench.label} ]</span>
                <span className="ml-auto flex items-center gap-1">
                  {h?.model && <span className="mr-1 bg-amber-400/10 px-1.5 py-px text-[9.5px] font-bold tracking-[0.1em] text-amber-300">MODEL DATA</span>}
                  {WINDOWS.map(([l, v]) => (
                    <button key={v} type="button" onClick={() => setWin(v)} aria-pressed={win === v}
                      className={`h-6 px-2 text-[10px] font-bold ${win === v ? "oasis-on" : "text-zinc-500 hover:text-zinc-200"}`}>{l}</button>
                  ))}
                </span>
              </header>

              <div className="min-h-[280px] flex-1 px-3 py-3">
                {h ? <RelChart a={h.a} b={h.b} labelA={act.ticker} labelB={bench.sym} /> : <div className="h-full animate-pulse bg-white/[0.02]" />}
              </div>

              <div className={`grid grid-cols-2 border-t ${B} xl:grid-cols-4`}>
                {([
                  ["BETA VS " + bench.sym, st ? st.beta.toFixed(2) : "…", st ? (st.beta > 1.05 ? "text-amber-300" : "text-zinc-100") : "text-zinc-600", st ? (st.beta > 1 ? "moves more than the sector" : "moves less than the sector") : ""],
                  [`SPREAD · ${winLabel}`, spread != null ? sgn(spread) : "…", spread != null ? tone(spread) : "text-zinc-600", spread != null ? (spread >= 0 ? "OUTPERFORMING" : "UNDERPERFORMING") : ""],
                  ["CORRELATION", st ? st.corr.toFixed(2) : "…", "text-zinc-100", st ? (st.corr > 0.8 ? "tracks the sector closely" : "own drivers matter") : ""],
                  ["TOP HOLDING", top ? top.tic : "—", "text-zinc-100", top ? `${top.w.toFixed(2)}% · ${top.name}` : "no holdings data"],
                ] as const).map(([k, v, c, sub2], i) => (
                  <div key={k} className={`flex min-w-0 flex-col gap-1 px-3 py-2.5 ${i ? `border-l ${B}` : ""} max-xl:[&:nth-child(3)]:border-l-0 max-xl:[&:nth-child(n+3)]:border-t max-xl:[&:nth-child(n+3)]:border-white/[0.05]`}>
                    <span className="text-[9.5px] font-semibold tracking-[0.14em] text-zinc-600">{k}</span>
                    <span className={`text-[18px] font-semibold leading-none tabular-nums ${c}`}>{v}</span>
                    <span className="truncate text-[9.5px] tracking-[0.04em] text-zinc-500" title={sub2}>{sub2}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[11px] tracking-[0.1em] text-zinc-600">SELECT AN ETF ON THE LEFT</div>
          )}
        </section>
      </div>
    </div>
  );
}
