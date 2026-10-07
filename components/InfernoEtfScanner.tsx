"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

const SECTORS: Sector[] = [
  {
    title: "TECHNOLOGY",
    etfs: [
      { ticker: "QQQ", name: "Invesco QQQ Trust", provider: "Invesco", aum: 320, change1d: 1.12, price: 512.8, note: "Semiconductor strength and AI capex headlines drive Nasdaq-100 outperformance." },
      { ticker: "XLK", name: "Technology Select Sector SPDR", provider: "State Street", aum: 78, change1d: 1.65, price: 236.4, note: "Surging on broad tech rally and semiconductor earnings beat." },
      { ticker: "VGT", name: "Vanguard Information Technology ETF", provider: "Vanguard", aum: 72, change1d: 1.58, price: 612.3, note: "Mega-cap software and chip names lead on lower real yields." },
      { ticker: "SMH", name: "VanEck Semiconductor ETF", provider: "Other", aum: 24, change1d: 2.48, price: 262.1, note: "Chip leaders rally on record hyperscaler capex guidance." },
      { ticker: "SOXX", name: "iShares Semiconductor ETF", provider: "BlackRock", aum: 14, change1d: 2.31, price: 231.7, note: "Foundry and equipment names extend momentum." },
      { ticker: "IGV", name: "iShares Expanded Tech-Software ETF", provider: "BlackRock", aum: 11, change1d: 0.27, price: 104.9, note: "Software mixed after cloud guidance; AI monetization still unproven." },
    ],
  },
  {
    title: "FINANCIALS",
    etfs: [
      { ticker: "XLF", name: "Financial Select Sector SPDR", provider: "State Street", aum: 52, change1d: 0.71, price: 48.9, note: "Steeper yield curve supports bank net interest margins." },
      { ticker: "VFH", name: "Vanguard Financials ETF", provider: "Vanguard", aum: 11, change1d: 0.64, price: 118.2, note: "Large banks firm ahead of stress-test results." },
      { ticker: "KRE", name: "SPDR S&P Regional Banking ETF", provider: "State Street", aum: 3.2, change1d: -0.82, price: 58.4, note: "Regionals slip on commercial real-estate loss provisions." },
      { ticker: "KBE", name: "SPDR S&P Bank ETF", provider: "State Street", aum: 2.1, change1d: 0.12, price: 54.1, note: "Money-center strength offsets regional weakness." },
    ],
  },
  {
    title: "HEALTHCARE",
    etfs: [
      { ticker: "XLV", name: "Health Care Select Sector SPDR", provider: "State Street", aum: 40, change1d: 0.09, price: 148.6, note: "Managed-care rebound offsets biotech softness." },
      { ticker: "VHT", name: "Vanguard Health Care ETF", provider: "Vanguard", aum: 16, change1d: 0.14, price: 262.7, note: "Large-cap pharma steady; devices mixed." },
      { ticker: "IBB", name: "iShares Biotechnology ETF", provider: "BlackRock", aum: 8, change1d: -0.95, price: 131.2, note: "Biotech slides on sector-wide drug-pricing headlines." },
      { ticker: "XBI", name: "SPDR S&P Biotech ETF", provider: "State Street", aum: 6.5, change1d: -1.38, price: 89.6, note: "Small-cap biotech sold on funding-cost worries and trial setbacks." },
    ],
  },
  {
    title: "ENERGY & UTILITIES",
    etfs: [
      { ticker: "XLE", name: "Energy Select Sector SPDR", provider: "State Street", aum: 36, change1d: -2.34, price: 87.2, note: "Crude retreats on rising inventories and OPEC+ supply talk." },
      { ticker: "XLU", name: "Utilities Select Sector SPDR", provider: "State Street", aum: 17, change1d: 0.64, price: 79.9, note: "Data-center power-demand narrative sustains the bid." },
      { ticker: "VDE", name: "Vanguard Energy ETF", provider: "Vanguard", aum: 9, change1d: -2.21, price: 118.5, note: "Integrated majors follow crude lower." },
    ],
  },
  {
    title: "CONSUMER",
    etfs: [
      { ticker: "XLY", name: "Consumer Discretionary Select SPDR", provider: "State Street", aum: 21, change1d: 0.92, price: 214.5, note: "Retail sales beat lifts e-commerce and autos." },
      { ticker: "XLP", name: "Consumer Staples Select Sector SPDR", provider: "State Street", aum: 16, change1d: -0.46, price: 81.7, note: "Defensive names lag as risk appetite improves." },
      { ticker: "VCR", name: "Vanguard Consumer Discretionary ETF", provider: "Vanguard", aum: 6.4, change1d: 0.88, price: 361.4, note: "Discretionary bid on resilient spending data." },
    ],
  },
  {
    title: "BROAD MARKET (CORE)",
    etfs: [
      { ticker: "IVV", name: "iShares Core S&P 500 ETF", provider: "BlackRock", aum: 560, change1d: 0.41, price: 587.1, note: "Tracks the S&P 500 higher; steady core inflows." },
      { ticker: "VOO", name: "Vanguard S&P 500 ETF", provider: "Vanguard", aum: 540, change1d: 0.42, price: 537.4, note: "Mirrors S&P gains on megacap earnings revisions." },
      { ticker: "VTI", name: "Vanguard Total Stock Market ETF", provider: "Vanguard", aum: 450, change1d: 0.38, price: 288.6, note: "Small-cap breadth slightly lags large caps." },
    ],
  },
];

const MACRO: MacroEtf[] = [
  { ticker: "UUP", name: "Invesco DB US Dollar Index Fund", provider: "Invesco", tag: "US Dollar Index", aum: 1.9, change1d: 0.21, price: 29.4, note: "Dollar bid on relative US growth and policy-rate expectations." },
  { ticker: "GLD", name: "SPDR Gold Shares", provider: "State Street", tag: "Gold", aum: 72, change1d: 0.9, price: 243.7, note: "Gold edges up as real yields ease and central-bank buying persists." },
  { ticker: "SLV", name: "iShares Silver Trust", provider: "BlackRock", tag: "Silver", aum: 13, change1d: 1.74, price: 27.6, note: "Silver outpaces gold on industrial demand and solar-sector orders." },
  { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", provider: "State Street", tag: "S&P 500", aum: 580, change1d: 0.42, price: 584.2, note: "Broad tape firm as megacap earnings revisions lift index EPS estimates." },
];

const PROVIDERS: Provider[] = ["BlackRock", "Vanguard", "State Street", "Invesco"];

/* ───────────────────────────── Helpers ─────────────────────────────── */

const SECTOR_GAP = 8; // half-gutter between sector cards
const HEADER_H = 28; // sector card title bar
const MONO = "font-mono";

const fmtPct = (c: number) =>
  (c > 0 ? "+" : c < 0 ? "−" : "") + Math.abs(c).toFixed(2) + "%";

const tileBg = (c: number) => {
  if (c >= 1.5) return "linear-gradient(135deg,#064e3b,#059669)";
  if (c >= 0.5) return "linear-gradient(135deg,rgba(6,78,59,0.8),#047857)";
  if (c > 0.15) return "linear-gradient(135deg,rgba(6,78,59,0.55),rgba(4,120,87,0.75))";
  if (c >= -0.15) return "linear-gradient(135deg,#1e293b,#334155)";
  if (c > -0.5) return "linear-gradient(135deg,rgba(127,29,29,0.6),rgba(153,27,27,0.8))";
  if (c > -1.5) return "linear-gradient(135deg,#7f1d1d,#b91c1c)";
  return "linear-gradient(135deg,#450a0a,#991b1b)";
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
      "flex-1 cursor-pointer rounded-lg px-1 py-[9px] text-center text-xs font-semibold transition-colors",
      active
        ? "bg-white/[0.14] text-[#FAFAFA] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] hover:bg-white/[0.18]"
        : "bg-white/[0.05] text-[#A1A1AA] hover:bg-white/10",
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

    let total = 0;
    const groups = SECTORS.map(({ title, etfs }) => {
      const rows = etfs.filter((e) => !disabled[e.provider]).sort(cmp);
      total += rows.length;
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

    return { sectors: laid, count: total };
  }, [sort, disabled, size, weightOf]);

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
      <aside className="flex min-h-0 flex-col gap-5 self-stretch overflow-y-auto rounded-3xl border border-white/[0.04] bg-[#121214] p-5">
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold tracking-[-0.02em] text-[#FAFAFA]">ETF Market Map</span>
          <span className="text-xs text-[#71717A]">1-day performance · {count} funds</span>
        </div>

        <div className="flex flex-col gap-2.5">
          <SectionLabel>SIZING</SectionLabel>
          <div className="flex gap-1.5">
            <ToggleButton active={!equalWeight} onClick={() => setEqualWeight(false)}>
              Market Weight
            </ToggleButton>
            <ToggleButton active={equalWeight} onClick={() => setEqualWeight(true)}>
              Equal Weight
            </ToggleButton>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <SectionLabel>SORTING</SectionLabel>
          <div className="flex gap-1.5">
            <ToggleButton active={sort === "aum"} onClick={() => setSort("aum")}>
              AUM (Largest First)
            </ToggleButton>
            <ToggleButton active={sort === "chg"} onClick={() => setSort("chg")}>
              % Change
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
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-[9px] text-left hover:bg-white/10 ${
                    on ? "bg-white/[0.05]" : "bg-transparent"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 flex-none items-center justify-center rounded-[5px] border text-[10px] font-bold text-[#031] ${
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
          <div className="h-2.5 rounded-full bg-[linear-gradient(90deg,#7f1d1d,#b91c1c_22%,#334155_50%,#047857_78%,#065f46)]" />
          <div className={`${MONO} flex justify-between text-[11px] text-[#71717A]`}>
            <span>−3%</span>
            <span>0%</span>
            <span>+3%</span>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto">
        <div className="flex flex-none flex-wrap items-baseline justify-between gap-3 px-1">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-[#A1A1AA]">
            EQUITY ETF MAP · {equalWeight ? "EQUAL WEIGHT" : "MARKET WEIGHT"} ·{" "}
            {sort === "aum" ? "BY AUM" : "BY % CHANGE"}
          </span>
          <span className={`${MONO} text-[11px] text-[#52525B]`}>hover a tile for AI oversight · click for deep view</span>
        </div>

        {/* Treemap */}
        <div ref={mapRef} className="relative min-h-[420px] flex-auto overflow-hidden bg-[#030303]">
          {sectors.map((s) => (
            <div
              key={s.title}
              onMouseEnter={() => setHoverSector(s.title)}
              onMouseLeave={() => setHoverSector(null)}
              className="absolute box-border overflow-hidden rounded-2xl border border-white/[0.04] bg-[#0a0a0c]"
              style={{ left: s.x, top: s.y, width: s.w, height: s.h, zIndex: hoverSector === s.title ? 5 : 1 }}
            >
              <div className="absolute inset-x-0 top-0 flex h-7 items-center justify-between gap-2 overflow-hidden px-3.5">
                <span className="min-w-0 truncate text-[10px] font-semibold tracking-[0.12em] text-[#A1A1AA]">
                  {s.title}
                </span>
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
                    className="absolute box-border flex cursor-pointer flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[1px] border-b border-r border-[#030303] transition-[transform,filter] duration-200 hover:z-20 hover:scale-[1.03] hover:brightness-125"
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
        <div className="mt-2 box-border flex w-full flex-none flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.04] bg-[#0a0a0c] px-6 py-4">
          <span className={`${MONO} text-[11px] font-semibold tracking-[0.14em] text-[#71717A]`}>[ MACRO BASELINE ]</span>
          <div className="flex flex-wrap items-center gap-2.5">
            {MACRO.map((m) => {
              const up = m.change1d >= 0;
              return (
                <div
                  key={m.ticker}
                  {...hoverHandlers(m)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-full bg-white/[0.05] px-3.5 py-2 transition-colors duration-150 hover:bg-white/10"
                >
                  <span className={`${MONO} text-[13px] font-bold text-[#FAFAFA]`}>{m.ticker}</span>
                  <span className="text-[11px] text-[#71717A]">{m.tag}</span>
                  <span
                    className={`${MONO} rounded-lg px-2 py-0.5 text-xs font-bold ${
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
          className="pointer-events-none fixed z-[100] box-border flex w-72 flex-col gap-3 rounded-xl border border-white/10 bg-[#121214] p-4"
          style={{ left: Math.min(tip.x + 18, vw - 304), top: Math.max(8, Math.min(tip.y + 18, vh - 340)) }}
        >
          <div className="flex flex-col gap-0.5">
            <span className={`${MONO} text-[15px] font-bold text-[#FAFAFA]`}>{tip.etf.ticker}</span>
            <span className="text-xs text-[#A1A1AA]">{tip.etf.name}</span>
          </div>
          <svg viewBox="0 0 256 56" width={256} height={56} className="block">
            <defs>
              <linearGradient id="etf-spark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={tipColor} stopOpacity={0.28} />
                <stop offset="1" stopColor={tipColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <polygon points={spark.area} fill="url(#etf-spark)" />
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
              {fmtPct(tip.etf.change1d)} today
            </span>
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg border border-violet-400/[0.15] bg-violet-500/[0.08] px-3 py-2.5">
            <span className="text-[10px] font-semibold tracking-[0.1em] text-[#A78BFA]">✦ AI OVERSIGHT</span>
            <span className="text-xs leading-normal text-[#C4B5FD]">AI Note: {tip.etf.note}</span>
          </div>
        </div>
      )}
    </div>
  );
}
