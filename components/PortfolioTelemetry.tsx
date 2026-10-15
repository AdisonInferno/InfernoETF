"use client";

/* ─────────────────────────────────────────────────────────────
   Portfolio deep-view telemetry:
   · RiskTelemetry   — [ BETA ] [ MAX DRAWDOWN ] [ SHARPE ] from the 1Y portfolio path vs SPY
   · PnlAttribution  — today's top-3 drivers / draggers (weight × 1D move = pp of portfolio)
   · LookThroughFeed — company-level news for what you really own (ETFs opened up),
                       SORT: NEWEST | WEIGHT-ADJUSTED, with a badge saying WHY each item matters
   · ToolSkeleton    — placeholder for modules not built yet
   ───────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { portfolioPath, type Series } from "@/lib/portfolio-live";
import type { PItem } from "@/lib/portfolio-fund";
import { buildPortfolioFund } from "@/lib/portfolio-fund";

const MONO = "font-mono";
const B = "border-white/[0.05]";
const sgn = (v: number, d = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;
const tone = (v: number) => (v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-400");

/* ── Risk telemetry ── */
export function riskStats(series: Record<string, Series> | null | undefined, weights: Record<string, number>) {
  if (!series?.SPY) return null;
  const { mine, bench } = portfolioPath(series, weights);
  if (mine.length < 10) return null;
  const idx = mine.map((v) => 1 + v / 100), bx = bench.map((v) => 1 + v / 100);
  const r: number[] = [], rb: number[] = [];
  for (let i = 1; i < idx.length; i++) { r.push(idx[i] / idx[i - 1] - 1); rb.push(bx[i] / bx[i - 1] - 1); }
  const m = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  const mr = m(r), mb = m(rb);
  let cov = 0, vb = 0, vr = 0;
  r.forEach((v, i) => { cov += (v - mr) * (rb[i] - mb); vb += (rb[i] - mb) ** 2; vr += (v - mr) ** 2; });
  let peak = idx[0], dd = 0;
  for (const v of idx) { peak = Math.max(peak, v); dd = Math.min(dd, v / peak - 1); }
  const sd = Math.sqrt(vr / r.length);
  return { beta: vb ? cov / vb : 1, maxDD: dd * 100, sharpe: sd ? ((mr - 0.04 / 252) / sd) * Math.sqrt(252) : 0 };
}

export function RiskTelemetry({ stats, model }: { stats: ReturnType<typeof riskStats>; model?: boolean }) {
  const tag = (k: string, v: string, c = "text-zinc-100", hint?: string) => (
    <span key={k} title={hint} className={`${MONO} flex h-6 items-center gap-1.5 border ${B} bg-[#030303] px-2 text-[10.5px] font-bold tracking-[0.08em]`}>
      <span className="text-zinc-500">[ {k}:</span><span className={`tabular-nums ${c}`}>{v}</span><span className="text-zinc-500">]</span>
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tag("BETA", stats ? stats.beta.toFixed(2) : "…", stats && stats.beta > 1.1 ? "text-amber-300" : "text-zinc-100", "vs S&P 500, daily returns, 1Y")}
      {tag("MAX DRAWDOWN", stats ? `${stats.maxDD.toFixed(1)}%` : "…", "text-rose-400", "Worst peak-to-trough, 1Y")}
      {tag("SHARPE", stats ? stats.sharpe.toFixed(2) : "…", stats ? (stats.sharpe >= 1 ? "text-emerald-400" : "text-zinc-100") : "text-zinc-100", "Annualised, 1Y, rf 4%")}
      <span className={`${MONO} text-[9px] tracking-[0.12em] text-zinc-600`}>1Y · VS SPY{model ? " · MODEL DATA" : ""}</span>
    </div>
  );
}

/* ── PnL attribution ── */
export function PnlAttribution({ rows }: { rows: { ticker: string; name: string; weight: number; chg: number }[] }) {
  const contrib = rows.map((r) => ({ ...r, pp: (r.weight * r.chg) / 100 }));
  const total = contrib.reduce((a, r) => a + r.pp, 0);
  const up = [...contrib].filter((r) => r.pp > 0).sort((a, b) => b.pp - a.pp).slice(0, 3);
  const down = [...contrib].filter((r) => r.pp < 0).sort((a, b) => a.pp - b.pp).slice(0, 3);
  const max = Math.max(...contrib.map((r) => Math.abs(r.pp)), 0.01);
  const list = (title: string, items: typeof contrib, pos: boolean) => (
    <div className="flex min-w-0 flex-col">
      <span className={`border-b ${B} px-3 py-1.5 text-[9.5px] font-bold tracking-[0.14em] ${pos ? "text-emerald-400" : "text-rose-400"}`}>{title}</span>
      {items.map((r) => (
        <div key={r.ticker} className={`grid grid-cols-[52px_minmax(0,1fr)_64px_70px] items-center gap-2 border-b ${B} px-3 py-[6px] text-[11.5px] tabular-nums`} title={r.name}>
          <span className="font-bold text-zinc-100">{r.ticker}</span>
          <span className="relative h-2.5">
            <span className={`absolute inset-y-0 left-0 ${pos ? "bg-emerald-400/60" : "bg-rose-400/60"}`} style={{ width: `${(Math.abs(r.pp) / max) * 100}%` }} />
          </span>
          <span className={`text-right ${tone(r.chg)}`}>{sgn(r.chg)}%</span>
          <span className={`text-right font-bold ${tone(r.pp)}`}>{sgn(r.pp, 3)} pp</span>
        </div>
      ))}
      {!items.length && <span className="px-3 py-2 text-[10.5px] text-zinc-600">— none today —</span>}
    </div>
  );
  return (
    <section className={`${MONO} flex flex-col border ${B} bg-[#030303]`}>
      <header className={`flex items-center justify-between border-b ${B} px-3 py-2`}>
        <span className="text-[10.5px] font-bold tracking-[0.14em] text-zinc-200">[ PNL ATTRIBUTION · 1D ]</span>
        <span className="text-[10px] tabular-nums text-zinc-500">PORTFOLIO <span className={`font-bold ${tone(total)}`}>{sgn(total)}%</span> · CONTRIB = WEIGHT × 1D MOVE</span>
      </header>
      <div className={`grid grid-cols-2 divide-x divide-white/[0.05] max-md:grid-cols-1`}>
        {list("▲ DRIVERS", up, true)}
        {list("▼ DRAGGERS", down, false)}
      </div>
    </section>
  );
}

/* ── Look-through news feed ── */
interface NewsItem { id: string; ts: number; headline: string; summary?: string; source: string; url: string; holdings: { tic: string; w: number }[]; sectors: { sub: string; pct: number }[]; score: number; kind: "company" | "sector" | "macro" }

const ago = (ts: number) => {
  const s = Date.now() / 1000 - ts;
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))}M` : s < 86400 ? `${Math.round(s / 3600)}H` : `${Math.round(s / 86400)}D`;
};

/** Sample feed (clearly labelled) when the news archive has nothing yet — built from your real look-through weights. */
function sampleFeed(items: PItem[]): NewsItem[] {
  const fund = buildPortfolioFund(items);
  const now = Date.now() / 1000;
  const T = [
    (t: string) => `${t} guidance raised after stronger-than-expected quarter`,
    (t: string) => `Analysts trim ${t} price target on margin concerns`,
    (t: string) => `${t} announces new buyback programme`,
    (t: string) => `Regulators open probe into ${t} supply agreements`,
    (t: string) => `${t} shares active ahead of earnings call`,
  ];
  const company = fund.holdings.slice(0, 8).map((h, i) => ({
    id: `s:${h.tic}`, ts: now - (i * 7 + 2) * 1800, headline: T[i % T.length](h.tic), source: "SAMPLE", url: "#",
    holdings: [{ tic: h.tic, w: h.w }], sectors: [], score: h.w, kind: "company" as const,
  }));
  const sector = fund.sectors.slice(0, 3).map(([s, p], i) => ({
    id: `ss:${s}`, ts: now - (i * 5 + 1) * 3600, headline: `${s}: sector flows turn after rate repricing`, source: "SAMPLE", url: "#",
    holdings: [], sectors: [{ sub: s, pct: p }], score: p * 0.5, kind: "sector" as const,
  }));
  return [...company, ...sector, { id: "m:1", ts: now - 900, headline: "Treasury yields climb as traders price fewer cuts", source: "SAMPLE", url: "#", holdings: [], sectors: [], score: 1, kind: "macro" }];
}

export function LookThroughFeed({ items }: { items: PItem[] }) {
  const [sort, setSort] = useState<"NEWEST" | "WEIGHT">("WEIGHT");
  const [days, setDays] = useState(7);
  const key = JSON.stringify(items.map((i) => [i.ticker, i.weight])) + days;
  const [st, setSt] = useState<{ key: string; list: NewsItem[] | null }>({ key: "", list: null });
  useEffect(() => {
    let off = false;
    fetch(`/api/news-archive/portfolio?days=${days}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { company?: NewsItem[]; sector?: NewsItem[]; macro?: NewsItem[] } | null) => {
        if (off) return;
        const tag = (k: NewsItem["kind"]) => (x: NewsItem) => ({ ...x, kind: k });
        setSt({ key, list: d ? [...(d.company ?? []).map(tag("company")), ...(d.sector ?? []).map(tag("sector")), ...(d.macro ?? []).map(tag("macro"))] : [] });
      })
      .catch(() => { if (!off) setSt({ key, list: [] }); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures items + days
  }, [key]);

  const raw = st.key === key ? st.list : null;
  const sample = raw !== null && raw.length === 0;
  const list = useMemo(() => {
    const src = raw === null ? null : raw.length ? raw : sampleFeed(items);
    if (!src) return null;
    // weight-adjusted: % of YOUR portfolio the story touches (company = summed look-through weight,
    // sector = half the sector weight, macro = small floor), lightly decayed by age (half-life 3 days)
    const wScore = (n: NewsItem) => {
      const base = n.kind === "company" ? n.holdings.reduce((a, h) => a + h.w, 0) : n.kind === "sector" ? (n.sectors[0]?.pct ?? 0) * 0.5 : 0.8;
      const age = Math.max(0, Date.now() / 1000 - n.ts) / 86400;
      return base * Math.pow(0.5, age / 3);
    };
    return [...src].sort(sort === "NEWEST" ? (a, b) => b.ts - a.ts : (a, b) => wScore(b) - wScore(a));
  }, [raw, items, sort]);

  const btn = (on: boolean) => `h-7 border px-2.5 text-[10.5px] font-bold tracking-[0.08em] transition-colors ${on ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : `${B} text-zinc-500 hover:text-zinc-200`}`;
  return (
    <section className={`${MONO} flex flex-col border ${B} bg-[#030303]`}>
      <header className={`flex flex-wrap items-center gap-2 border-b ${B} px-3 py-2`}>
        <span className="mr-2 text-[11px] font-bold tracking-[0.14em] text-zinc-200">[ LOOK-THROUGH FEED ]</span>
        <button type="button" onClick={() => setSort("NEWEST")} aria-pressed={sort === "NEWEST"} className={btn(sort === "NEWEST")}>[ SORT: NEWEST ]</button>
        <button type="button" onClick={() => setSort("WEIGHT")} aria-pressed={sort === "WEIGHT"} className={btn(sort === "WEIGHT")}>[ SORT: WEIGHT-ADJUSTED ]</button>
        <span className="ml-auto flex items-center gap-1">
          {sample && <span className="mr-2 bg-amber-400/10 px-1.5 py-px text-[9.5px] font-bold tracking-[0.1em] text-amber-300" title="News archive is empty — sample headlines built from your real weights">SAMPLE FEED</span>}
          {[1, 7, 30].map((d) => <button key={d} type="button" onClick={() => setDays(d)} className={`h-6 px-2 text-[10px] font-bold ${days === d ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:text-zinc-200"}`}>{d}D</button>)}
        </span>
      </header>
      {list === null && Array.from({ length: 6 }, (_, i) => <div key={i} className={`h-[46px] animate-pulse border-b ${B} bg-white/[0.015]`} />)}
      {list?.map((n) => (
        <a key={n.id} href={n.url} target="_blank" rel="noreferrer" className={`grid grid-cols-[44px_minmax(0,1fr)] gap-3 border-b ${B} px-3 py-2 transition-colors hover:bg-white/[0.03]`}>
          <span className="pt-0.5 text-[10px] tabular-nums text-zinc-500">{ago(n.ts)}</span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-sans text-[13px] leading-snug text-zinc-100" title={n.headline}>{n.headline}</span>
            <span className="flex flex-wrap items-center gap-1.5 text-[9.5px] font-bold tracking-[0.06em]">
              {n.kind === "company" && n.holdings.slice(0, 3).map((h) => (
                <span key={h.tic} className="border border-emerald-500/30 bg-emerald-500/[0.07] px-1.5 py-px text-emerald-300">[ {h.tic} — {h.w.toFixed(1)}% PORTFOLIO WEIGHT ]</span>
              ))}
              {n.kind === "sector" && n.sectors.slice(0, 2).map((s) => (
                <span key={s.sub} className="border border-sky-500/30 bg-sky-500/[0.07] px-1.5 py-px text-sky-300">[ SECTOR: {s.sub.toUpperCase()} — {s.pct.toFixed(1)}% ]</span>
              ))}
              {n.kind === "macro" && <span className={`border ${B} px-1.5 py-px text-zinc-400`}>[ MACRO — ALL POSITIONS ]</span>}
              <span className="font-normal text-zinc-600">{n.source.toUpperCase()}</span>
            </span>
          </span>
        </a>
      ))}
    </section>
  );
}

/* ── Skeleton for modules not built yet ── */
export function ToolSkeleton({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section className={`${MONO} flex flex-col border ${B} bg-[#030303]`}>
      <header className={`flex items-center justify-between border-b ${B} px-3 py-2`}>
        <span className="text-[11px] font-bold tracking-[0.14em] text-zinc-200">[ {title} ]</span>
        <span className="text-[9.5px] tracking-[0.14em] text-amber-400/80">SYSTEM PENDING</span>
      </header>
      <div className="grid grid-cols-1 gap-2 p-3 md:grid-cols-3">
        {lines.map((l) => (
          <div key={l} className={`flex h-[120px] flex-col gap-2 border border-dashed ${B} p-3`}>
            <span className="text-[10px] font-bold tracking-[0.12em] text-zinc-500">{l}</span>
            <span className="h-2 w-2/3 animate-pulse bg-white/[0.04]" /><span className="h-2 w-1/2 animate-pulse bg-white/[0.04]" /><span className="h-2 w-3/4 animate-pulse bg-white/[0.04]" />
          </div>
        ))}
      </div>
    </section>
  );
}
