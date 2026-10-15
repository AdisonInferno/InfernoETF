"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ETFS, type EtfRow } from "@/lib/etfs";
import { QUOTE } from "@/lib/fund-profiles";

/* ─────────────────────────────── Types ─────────────────────────────── */

type Provider = "BlackRock" | "Vanguard" | "State Street" | "Invesco" | "Other";

interface Etf {
  ticker: string;
  name: string;
  provider: Provider;
  /** Assets under management, in $B */
  aum: number;
  /** 1-day change, in % */
  change1d: number;
  price: number;
  note: string;
}

interface Sector {
  title: string;
  etfs: Etf[];
}

interface MacroEtf extends Etf {
  tag: string;
}

type SortKey = "aum" | "chg";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ───────────────────────────── Mock data ───────────────────────────── */

/** Map sectors built from the full ETF database (lib/etfs). Order = default tile order. */
const MAP_SECTORS: { title: string; short: string; test: (e: EtfRow) => boolean }[] = [
  { title: "INDEXES", short: "IDX", test: (e) => e.category === "indexes" },
  { title: "TECHNOLOGY", short: "TECH", test: (e) => e.category === "ai-tech" },
  { title: "DEFENSE", short: "DEF", test: (e) => e.category === "defense" },
  { title: "FINANCIALS", short: "FIN", test: (e) => e.category === "financials" },
  { title: "ENERGY", short: "ENRG", test: (e) => e.category === "energy" || e.sector === "UTILITIES" },
  { title: "COMMODITIES", short: "CMDTY", test: (e) => e.category === "commodities" },
  { title: "INDUSTRIALS", short: "IND", test: (e) => e.category === "industry" },
  { title: "HEALTHCARE", short: "HLTH", test: (e) => ["BIG PHARMA", "HEALTHCARE", "BIOTECH"].includes(e.sector) },
  { title: "CONSUMER", short: "CONS", test: (e) => ["CONSUMER", "STAPLES"].includes(e.sector) },
  { title: "CRYPTO", short: "CRYPTO", test: (e) => ["BITCOIN", "ETHEREUM"].includes(e.sector) },
  { title: "BONDS & FX", short: "BND/FX", test: (e) => ["TREASURIES", "US DOLLAR"].includes(e.sector) },
];
const KNOWN: Provider[] = ["BlackRock", "Vanguard", "State Street", "Invesco"];
const toEtf = (e: EtfRow): Etf => ({
  ticker: e.ticker, name: e.name, provider: (KNOWN as string[]).includes(e.issuer) ? (e.issuer as Provider) : "Other",
  aum: e.aum, change1d: e.chg1d, price: QUOTE[e.ticker]?.[0] ?? 0, note: `${e.sector} · ${e.issuer}`,
});
const SECTORS: Sector[] = MAP_SECTORS.map(({ title, test }) => ({
  title,
  etfs: ETFS.filter((e) => e.leverage === "1x" && test(e)).map(toEtf),
})).filter((s) => s.etfs.length);
const SHORT: Record<string, string> = Object.fromEntries(MAP_SECTORS.map((m) => [m.title, m.short]));

const MACRO: MacroEtf[] = [
  { ticker: "UUP", name: "Invesco DB US Dollar Index Fund", provider: "Invesco", tag: "US Dollar Index", aum: 1.9, change1d: 0.21, price: 29.4, note: "Dollar bid on relative US growth and policy-rate expectations." },
  { ticker: "GLD", name: "SPDR Gold Shares", provider: "State Street", tag: "Gold", aum: 72, change1d: 0.9, price: 243.7, note: "Gold edges up as real yields ease and central-bank buying persists." },
  { ticker: "SLV", name: "iShares Silver Trust", provider: "BlackRock", tag: "Silver", aum: 13, change1d: 1.74, price: 27.6, note: "Silver outpaces gold on industrial demand and solar-sector orders." },
  { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", provider: "State Street", tag: "S&P 500", aum: 580, change1d: 0.42, price: 584.2, note: "Broad tape firm as megacap earnings revisions lift index EPS estimates." },
];

const PROVIDERS: Provider[] = ["BlackRock", "Vanguard", "State Street", "Invesco", "Other"];

/* ───────────────────────────── Helpers ─────────────────────────────── */

const SECTOR_GAP = 8; // half-gutter between sector cards
const HEADER_H = 28; // sector card title bar
const MONO = "font-mono";

const fmtPct = (c: number) =>
  (c > 0 ? "+" : c < 0 ? "−" : "") + Math.abs(c).toFixed(2) + "%";

const tileBg = (c: number) => {
  if (c >= 1.5) return "#047857";
  if (c >= 0.5) return "#065f46";
  if (c > 0.15) return "#064e3b";
  if (c >= -0.15) return "#27272a";
  if (c > -0.5) return "#7f1d1d";
  if (c > -1.5) return "#991b1b";
  return "#b91c1c";
};

const trendColor = (c: number) => (c >= 0 ? "#34D399" : "#F87171");

/**
 * Strict binary-split treemap: partitions items at the weight midpoint and
 * splits along the longer axis, recursively. Fills the rect with no gaps.
 */
function layoutTreemap<T extends { wt: number }>(
  items: T[],
  rect: Rect,
  out: Array<Rect & { item: T }> = []
): Array<Rect & { item: T }> {
  const { x, y, w, h } = rect;
  if (!items.length) return out;
  if (items.length === 1) {
    out.push({ item: items[0], x, y, w, h });
    return out;
  }
  const total = items.reduce((s, i) => s + i.wt, 0);
  let acc = 0;
  let k = 1;
  for (let i = 0; i < items.length - 1; i++) {
    acc += items[i].wt;
    k = i + 1;
    if (acc >= total / 2) break;
  }
  const a = items.slice(0, k);
  const b = items.slice(k);
  const ratio = a.reduce((s, i) => s + i.wt, 0) / total;
  if (w >= h) {
    layoutTreemap(a, { x, y, w: w * ratio, h }, out);
    layoutTreemap(b, { x: x + w * ratio, y, w: w * (1 - ratio), h }, out);
  } else {
    layoutTreemap(a, { x, y, w, h: h * ratio }, out);
    layoutTreemap(b, { x, y: y + h * ratio, w, h: h * (1 - ratio) }, out);
  }
  return out;
}

/** Deterministic pseudo-random sparkline seeded by ticker. */
function sparkline(etf: Etf) {
  let h = 0;
  for (const ch of etf.ticker) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
  const up = etf.change1d >= 0;
  const n = 32;
  const pts: number[] = [];
  let v = 0;
  for (let i = 0; i < n; i++) {
    v += (rnd() - 0.5) * 1.2 + (up ? 0.1 : -0.1);
    pts.push(v);
  }
  const mn = Math.min(...pts);
  const rg = Math.max(...pts) - mn || 1;
  const line = pts
    .map((p, i) => `${((i / (n - 1)) * 256).toFixed(1)},${(52 - ((p - mn) / rg) * 46).toFixed(1)}`)
    .join(" ");
  return { line, area: `0,56 ${line} 256,56` };
}

/* ───────────────────────────── UI pieces ───────────────────────────── */

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[11px] font-semibold tracking-[0.08em] text-[#71717A]">{children}</span>
);

const ToggleButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      "flex-1 cursor-pointer rounded-sm border px-1 py-[9px] text-center text-xs font-semibold transition-colors",
      active
        ? "border-white/[0.14] bg-white/[0.10] text-[#FAFAFA] hover:bg-white/[0.14]"
        : "border-white/[0.06] bg-white/[0.03] text-[#A1A1AA] hover:bg-white/[0.08]",
    ].join(" ")}
  >
    {children}
  </button>
);

/* ───────────────────────────── Component ───────────────────────────── */

export default function InfernoEtfScanner() {
  const router = useRouter();
  const [equalWeight, setEqualWeight] = useState(true);
  const [sort, setSort] = useState<SortKey>("aum");
  const [disabled, setDisabled] = useState<Partial<Record<Provider, boolean>>>({});
  const [hoverSector, setHoverSector] = useState<string | null>(null);
  const [tip, setTip] = useState<{ etf: Etf; x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 960, h: 560 });
  const mapRef = useRef<HTMLDivElement>(null);
  /** Zoom / compare: empty = whole market. Click = zoom into one sector, right-click = add/remove (compare). */
  const [focus, setFocus] = useState<string[]>([]);
  const zoom = (t: string) => setFocus((f) => (f.length === 1 && f[0] === t ? [] : [t]));
  const compare = (t: string) => setFocus((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]));

  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const measure = () =>
      setSize((s) =>
        Math.abs(el.clientWidth - s.w) > 1 || Math.abs(el.clientHeight - s.h) > 1
          ? { w: el.clientWidth, h: el.clientHeight }
          : s
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const weightOf = useCallback((e: Etf) => (equalWeight ? 1 : Math.sqrt(e.aum)), [equalWeight]);

  const { sectors, count } = useMemo(() => {
    const cmp =
      sort === "aum" ? (a: Etf, b: Etf) => b.aum - a.aum : (a: Etf, b: Etf) => b.change1d - a.change1d;

    const groups = SECTORS.filter((g) => !focus.length || focus.includes(g.title)).map(({ title, etfs }) => {
      const rows = etfs.filter((e) => !disabled[e.provider]).sort(cmp);
      const avg = rows.length ? rows.reduce((s, e) => s + e.change1d, 0) / rows.length : 0;
      return {
        title,
        rows,
        avg,
        aum: rows.reduce((s, e) => s + e.aum, 0),
        wt: rows.reduce((s, e) => s + weightOf(e), 0),
      };
    }).filter((g) => g.rows.length);

    groups.sort(sort === "aum" ? (p, q) => q.aum - p.aum : (p, q) => q.avg - p.avg);

    const laid = layoutTreemap(groups, { x: 0, y: 0, w: size.w, h: size.h }).map(({ item, x, y, w, h }) => {
      const cardW = w - SECTOR_GAP * 2;
      const cardH = h - SECTOR_GAP * 2;
      const tiles = layoutTreemap(
        item.rows.map((etf) => ({ etf, wt: weightOf(etf) })),
        { x: 0, y: HEADER_H, w: cardW - 2, h: cardH - 2 - HEADER_H }
      );
      return { ...item, x: x + SECTOR_GAP, y: y + SECTOR_GAP, w: cardW, h: cardH, tiles };
    });

    return { sectors: laid, count: groups.reduce((n, g) => n + g.rows.length, 0) };
  }, [sort, disabled, size, weightOf, focus]);

  const providerCounts = useMemo(() => {
    const all = SECTORS.flatMap((s) => s.etfs);
    return Object.fromEntries(PROVIDERS.map((p) => [p, all.filter((e) => e.provider === p).length]));
  }, []);

  const hoverHandlers = (etf: Etf) => ({
    onClick: () => router.push(`/etf/${etf.ticker}`),
    onMouseEnter: (e: React.MouseEvent) => setTip({ etf, x: e.clientX, y: e.clientY }),
    onMouseMove: (e: React.MouseEvent) => setTip({ etf, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setTip(null),
  });

  const vw = typeof window !== "undefined" ? window.innerWidth : 1400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const spark = tip ? sparkline(tip.etf) : null;
  const tipColor = tip ? trendColor(tip.etf.change1d) : "#34D399";

  return (
    <div className="absolute inset-0 grid grid-cols-[260px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-4 overflow-hidden bg-[#030303] p-4 font-sans text-[#E5E5E5]">
      {/* ── Sidebar ── */}
      <aside className="flex min-h-0 flex-col gap-5 self-stretch overflow-y-auto rounded-sm border border-white/[0.06] bg-[#0a0a0c] p-3">
        <div className="flex flex-col gap-1">
          <span className={`${MONO} text-[13px] font-semibold tracking-[0.12em] text-[#FAFAFA]`}>[ ETF MARKET MAP ]</span>
        </div>

        <div className="flex flex-col gap-2.5">
          <SectionLabel>SIZING</SectionLabel>
          <div className="flex gap-1.5">
            <ToggleButton active={!equalWeight} onClick={() => setEqualWeight(false)}>
              MKT WEIGHT
            </ToggleButton>
            <ToggleButton active={equalWeight} onClick={() => setEqualWeight(true)}>
              EQUAL
            </ToggleButton>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <SectionLabel>SORTING</SectionLabel>
          <div className="flex gap-1.5">
            <ToggleButton active={sort === "aum"} onClick={() => setSort("aum")}>
              AUM ↓
            </ToggleButton>
            <ToggleButton active={sort === "chg"} onClick={() => setSort("chg")}>
              % CHG ↓
            </ToggleButton>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <SectionLabel>PROVIDER FILTER</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {PROVIDERS.map((p) => {
              const on = !disabled[p];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDisabled((d) => ({ ...d, [p]: on }))}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-sm px-3 py-[9px] text-left hover:bg-white/10 ${
                    on ? "bg-white/[0.05]" : "bg-transparent"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 flex-none items-center justify-center rounded-[2px] border text-[10px] font-bold text-[#031] ${
                      on ? "border-[#34D399] bg-[#34D399]" : "border-white/[0.18] bg-transparent"
                    }`}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className={`flex-1 text-[13px] ${on ? "text-[#E5E5E5]" : "text-[#71717A]"}`}>{p}</span>
                  <span className={`${MONO} text-[11px] text-[#52525B]`}>{providerCounts[p]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <SectionLabel>COLOR SCALE</SectionLabel>
          <div className="h-2 rounded-sm bg-[linear-gradient(90deg,#b91c1c_0_16%,#991b1b_16%_32%,#7f1d1d_32%_44%,#27272a_44%_56%,#064e3b_56%_68%,#065f46_68%_84%,#047857_84%)]" />
          <div className={`${MONO} flex justify-between text-[11px] text-[#71717A]`}>
            <span>−3%</span>
            <span>0%</span>
            <span>+3%</span>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto">
        {/* Sector zoom / compare bar */}
        <nav aria-label="Sectors" className={`${MONO} flex flex-none flex-wrap items-center gap-1 px-1 text-[11px]`}>
          <button type="button" onClick={() => setFocus([])} aria-pressed={!focus.length}
            className={`rounded-sm px-2 py-1 font-bold tracking-[0.1em] transition-colors duration-75 ${!focus.length ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:bg-white/[0.05] hover:text-white"}`}>
            ALL
          </button>
          {SECTORS.map(({ title }) => {
            const on = focus.includes(title);
            return (
              <button key={title} type="button" onClick={() => zoom(title)} onContextMenu={(e) => { e.preventDefault(); compare(title); }}
                aria-pressed={on} title="Click: zoom · Right-click: add to compare"
                className={`rounded-sm px-2 py-1 font-bold tracking-[0.1em] transition-colors duration-75 ${
                  on ? "bg-red-500/[0.14] text-red-300 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.35)]" : focus.length ? "text-zinc-600 hover:text-zinc-200" : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                }`}>
                {SHORT[title] ?? title}
              </button>
            );
          })}
          <span className="ml-auto text-[10px] tracking-[0.08em] text-zinc-600">{focus.length > 1 ? `COMPARE · ${focus.length} SECTORS` : "RIGHT-CLICK = COMPARE"} · {count} ETF</span>
        </nav>

        {/* Treemap */}
        <div ref={mapRef} className="relative min-h-[420px] flex-auto overflow-hidden bg-[#030303]">
          {sectors.map((s) => (
            <div
              key={s.title}
              onContextMenu={(e) => { e.preventDefault(); compare(s.title); }}
              onMouseEnter={() => setHoverSector(s.title)}
              onMouseLeave={() => setHoverSector(null)}
              className={`absolute box-border overflow-hidden rounded-sm border bg-[#0a0a0c] ${focus.includes(s.title) ? "border-red-500/40" : "border-white/[0.06]"}`}
              style={{ left: s.x, top: s.y, width: s.w, height: s.h, zIndex: hoverSector === s.title ? 5 : 1 }}
            >
              <div className="absolute inset-x-0 top-0 flex h-7 items-center justify-between gap-2 overflow-hidden px-3.5">
                <button type="button" onClick={() => zoom(s.title)} title="Click: zoom · Right-click: compare"
                  className="min-w-0 truncate text-left text-[10.5px] font-semibold tracking-[0.12em] text-[#A1A1AA] hover:text-white">
                  {s.title}{focus.length === 1 && focus[0] === s.title ? "  ← ALL" : ""}
                </button>
                <span className={`${MONO} flex-none text-[10px] font-semibold`} style={{ color: trendColor(s.avg) }}>
                  {fmtPct(s.avg)}
                </span>
              </div>

              {s.tiles.map(({ item: { etf }, x, y, w, h }) => {
                const m = Math.min(w, h);
                const showPct = h >= 34 && w >= 54;
                return (
                  <div
                    key={etf.ticker}
                    {...hoverHandlers(etf)}
                    className="absolute box-border flex cursor-pointer flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[1px] border-b border-r border-[#030303] transition-[filter] duration-150 hover:z-20 hover:brightness-125"
                    style={{ left: x, top: y, width: w, height: h, background: tileBg(etf.change1d) }}
                  >
                    <span
                      className={`${MONO} font-bold text-white`}
                      style={{ fontSize: Math.max(9, Math.min(22, Math.round(m / 4.2))) }}
                    >
                      {etf.ticker}
                    </span>
                    {showPct && (
                      <span
                        className={`${MONO} font-semibold text-white/85`}
                        style={{ fontSize: Math.max(9, Math.min(13, Math.round(m / 6))) }}
                      >
                        {fmtPct(etf.change1d)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {sectors.length === 0 && (
            <div className="p-12 text-center text-[13px] text-[#71717A]">No funds match the selected providers.</div>
          )}
        </div>

        {/* Macro baseline */}
        <div className="mt-1 box-border w-full flex-none rounded-sm border border-white/[0.06] bg-[#0a0a0c] p-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {MACRO.map((m) => {
              const up = m.change1d >= 0;
              return (
                <div
                  key={m.ticker}
                  {...hoverHandlers(m)}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-sm border border-white/[0.06] bg-white/[0.03] px-4 py-3 transition-all duration-75 hover:border-white/[0.2] hover:bg-white/[0.08]"
                >
                  <span className="flex items-baseline gap-2.5">
                    <span className={`${MONO} text-[16px] font-bold text-[#FAFAFA]`}>{m.ticker}</span>
                    <span className="text-[11.5px] uppercase tracking-[0.06em] text-[#71717A]">{m.tag}</span>
                  </span>
                  <span
                    className={`${MONO} rounded-sm px-2 py-1 text-[13px] font-bold ${
                      up ? "bg-emerald-500/10 text-[#34D399]" : "bg-rose-500/10 text-[#FB7185]"
                    }`}
                  >
                    {fmtPct(m.change1d)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* ── Tooltip ── */}
      {tip && spark && (
        <div
          className="pointer-events-none fixed z-[100] box-border flex w-72 flex-col gap-3 rounded-sm border border-white/[0.08] bg-[#0a0a0c] p-4"
          style={{ left: Math.min(tip.x + 18, vw - 304), top: Math.max(8, Math.min(tip.y + 18, vh - 340)) }}
        >
          <div className="flex flex-col gap-0.5">
            <span className={`${MONO} text-[15px] font-bold text-[#FAFAFA]`}>{tip.etf.ticker}</span>
            <span className="text-xs text-[#A1A1AA]">{tip.etf.name}</span>
          </div>
          <svg viewBox="0 0 256 56" width={256} height={56} className="block">
            <polygon points={spark.area} fill={tipColor} fillOpacity={0.08} />
            <polyline
              points={spark.line}
              fill="none"
              stroke={tipColor}
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
          <div className={`${MONO} flex items-baseline justify-between`}>
            <span className="text-lg font-semibold text-[#FAFAFA]">${tip.etf.price.toFixed(2)}</span>
            <span className="text-[13px] font-bold" style={{ color: tipColor }}>
              {fmtPct(tip.etf.change1d)} 1D
            </span>
          </div>
          <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-2.5">
            <span className={`${MONO} flex justify-between text-[10px] tracking-[0.1em] text-zinc-500`}>
              <span>[ CATALYST ]</span>
              <span className={tip.etf.change1d >= 0 ? "text-emerald-400" : "text-rose-400"}>[ 1D: {tip.etf.change1d >= 0 ? "BULLISH" : "BEARISH"} ]</span>
            </span>
            <span className="text-xs leading-snug text-zinc-300">{tip.etf.note}</span>
            <span className={`${MONO} text-[9.5px] tracking-[0.08em] text-zinc-600`}>SRC: DESK NOTE · ILLUSTRATIVE</span>
          </div>
        </div>
      )}
    </div>
  );
}
