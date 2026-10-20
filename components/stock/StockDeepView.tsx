"use client";

/* ─────────────────────────────────────────────────────────────
   STOCK DEEP DIVE — /stock/[ticker]
   [ OVERVIEW ]   chart (same as ETFs) · valuation / profitability / EPS & revenue / risk · company card
   [ FINANCIALS ] quarterly revenue · profit / loss · cash flow (SEC filings), pick a range; click a quarter →
                  right half explains it: the numbers, Q/Q and Y/Y, margins and WHY it moved
                  + EPS: expectations vs reality
   [ CHARTS ]     seasonality (real monthly returns) · price reaction around earnings releases
   [ NEWS ]       company · sector · macro
   [ IN ETFS ]    which ETFs hold it and how much · your exposure (direct + through your ETFs)
   ───────────────────────────────────────────────────────────── */

import HoldingAttribution from "@/components/deep-view/HoldingAttribution";
import { useCtrlMeasure } from "@/lib/useCtrlMeasure";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import InfernoChart from "@/components/InfernoChart";
import EtfNewsPanel from "@/components/EtfNewsPanel";
import { ETFS } from "@/lib/etfs";
import { PROFILE_OF } from "@/lib/fund-profiles";
import { getAsset, lookThrough } from "@/lib/portfolio";
import { useMyPortfolio } from "@/lib/my-portfolio";
import { useSnapshot } from "@/lib/market-snapshot";
import { toggleFavorite, useWatchlist } from "@/lib/watchlist";
import type { EarningsRow, Quarter, StockData } from "@/lib/stock/data";
import { NA_CLASS, currencyOf, fmtPctValue, fmtRatio, formatMarketValue, naTone } from "@/lib/format";

const B = "border-white/[0.06]";
const CARD = `oasis-glass border ${B} bg-[var(--oasis-panel)]`;
const LABEL = "font-mono text-[10px] font-semibold tracking-[0.14em] text-zinc-500";

/** compact money in the listing's currency ("$2.45B" / "2.45B PLN"); "—" when missing */
const big = (v: number | null | undefined, ccy = "USD") => formatMarketValue(v, ccy, { compact: true, digits: 0 });
/** per-share money (EPS) in the listing's currency */
const perShare = (v: number | null | undefined, ccy = "USD") => formatMarketValue(v, ccy);
const pct = (v: number | null | undefined, d = 1) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}%`);
const tone = (v: number | null | undefined) => (v == null ? "text-zinc-500" : v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-300");
const chgOf = (a: number | null, b: number | null) => (a != null && b != null && b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null);

type Tab = "OV" | "FIN" | "COMP" | "CH" | "NEWS" | "ETF";
/** Tabs per asset type: a fund gets its COMPOSITION (holdings + drivers) — FINANCIALS (company filings) and
 *  IN ETFS (which funds hold it) only make sense for single stocks; an ETF is never held inside itself. */
const STOCK_TABS: [Tab, string][] = [["OV", "OVERVIEW"], ["FIN", "FINANCIALS"], ["CH", "CHARTS"], ["NEWS", "NEWS"], ["ETF", "IN ETFS"]];
const FUND_TABS: [Tab, string][] = [["OV", "OVERVIEW"], ["COMP", "COMPOSITION"], ["CH", "CHARTS"], ["NEWS", "NEWS"]];
const LOADING_TABS: [Tab, string][] = [["OV", "OVERVIEW"], ["CH", "CHARTS"], ["NEWS", "NEWS"]];
const isFundData = (d: StockData | null) => d?.quoteType === "ETF" || d?.quoteType === "MUTUALFUND";

/* ═════════════ FUND COMPOSITION (ETFs outside the database, from Yahoo top holdings) ═════════════ */
function FundComposition({ d, sym }: { d: StockData; sym: string }) {
  const hs = d.fundHoldings.filter((h) => h.symbol && h.w > 0);
  const max = Math.max(...hs.map((h) => h.w), 1);
  const listed = hs.reduce((t, h) => t + h.w, 0);
  if (!hs.length) {
    return <p className={`${CARD} m-5 p-5 font-mono text-[12px] text-zinc-500`}>No holdings data for {d.ticker} — the data source publishes holdings only for some funds.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 px-5 pb-12 pt-5 xl:grid-cols-12">
      <section className={`${CARD} flex flex-col p-4 xl:col-span-4`}>
        <span className={`${LABEL} mb-2 text-zinc-300`}>[ TOP HOLDINGS · {hs.length} · {listed.toFixed(1)}% OF FUND ]</span>
        {hs.map((h) => (
          <div key={h.symbol} className={`grid grid-cols-[64px_minmax(0,1fr)_minmax(0,0.8fr)_56px] items-center gap-3 border-b ${B} py-1.5 font-mono text-[12px] tabular-nums`}>
            <Link href={`/stock/${h.symbol}`} className="font-bold text-zinc-100 hover:text-oasis">{h.symbol}</Link>
            <span className="truncate font-sans text-[11.5px] text-zinc-400">{h.name}</span>
            <span className="h-2 bg-white/[0.04]"><span className="block h-full bg-emerald-500/60" style={{ width: `${(h.w / max) * 100}%` }} /></span>
            <span className="text-right font-semibold text-zinc-100">{h.w.toFixed(2)}%</span>
          </div>
        ))}
        <span className="pt-2 font-mono text-[9.5px] tracking-[0.06em] text-zinc-600">SRC: YAHOO FUND PROFILE · TOP HOLDINGS ONLY</span>
      </section>
      <div className="min-w-0 xl:col-span-8">
        <HoldingAttribution holdings={hs.map((h) => ({ tic: h.symbol, name: h.name, w: h.w }))} etfSym={sym} etfLabel={d.ticker} compact />
      </div>
    </div>
  );
}

/** ETFs in our database that hold this stock, with its weight in each */
function holders(ticker: string) {
  const want = ticker === "GOOG" ? "GOOGL" : ticker;
  const out: { etf: string; name: string; w: number }[] = [];
  for (const e of ETFS) {
    const prof = PROFILE_OF[e.ticker];
    if (!prof) continue;
    let w = 0;
    for (const line of prof.holdings) { const [t, , ww] = line.split("|"); if ((t === "GOOG" ? "GOOGL" : t) === want) w += Number(ww); }
    if (w > 0) out.push({ etf: e.ticker, name: e.name, w });
  }
  return out.sort((a, b) => b.w - a.w);
}

/* ═════════════ OVERVIEW ═════════════ */
function Overview({ d, held, sym }: { d: StockData; held: { etf: string; name: string; w: number }[]; sym: string }) {
  const peers = d.peers.slice(0, 4);
  const pos52 = d.price != null && d.hi52 != null && d.lo52 != null && d.hi52 > d.lo52 ? ((d.price - d.lo52) / (d.hi52 - d.lo52)) * 100 : null;
  const isFund = d.quoteType === "ETF" || d.quoteType === "MUTUALFUND";
  const ccy = currencyOf(d.ticker, { currency: d.currency, exchange: d.exchange });
  const groups: { t: string; items: [string, string, string?][] }[] = isFund ? [
    { t: "FUND PROFILE", items: [["AUM", big(d.aum, ccy)], ["TER", fmtPctValue(d.ter)]] },
    { t: "CATEGORY", items: [["CATEGORY", d.category ?? "—"], ["ISSUER", d.family ?? "—"]] },
    { t: "INCOME", items: [["YIELD", fmtPctValue(d.dividendYield)], ["P/E", fmtRatio(d.pe, 1)]] },
    { t: "RISK", items: [["BETA (1Y)", fmtRatio(d.beta)], ["52W", d.lo52 != null && d.hi52 != null && isFinite(d.lo52) && isFinite(d.hi52) ? `${d.lo52.toFixed(0)}–${d.hi52.toFixed(0)}` : "—"]] },
  ] : [
    { t: "VALUATION", items: [["MARKET CAP", big(d.marketCap, ccy)], ["P/E (TTM)", fmtRatio(d.pe, 1)]] },
    { t: "PROFITABILITY", items: [["GROSS MARGIN", fmtPctValue(d.grossMargin, 1)], ["NET MARGIN", fmtPctValue(d.netMargin, 1), d.netMargin != null && d.netMargin < 0 ? "text-rose-400" : undefined]] },
    { t: "EPS & REVENUE (TTM)", items: [["EPS", perShare(d.epsTTM, ccy), d.epsTTM != null && d.epsTTM < 0 ? "text-rose-400" : undefined], ["REVENUE", big(d.revenueTTM, ccy)]] },
    { t: "RISK & INCOME", items: [["BETA (1Y)", fmtRatio(d.beta)], ["DIV YIELD", fmtPctValue(d.dividendYield)]] },
  ];
  return (
    <div className="flex flex-col gap-4 px-5 pb-12 pt-5">
      <section className={`${CARD} flex h-[520px] flex-col p-3`}>
        <InfernoChart key={d.ticker} groupLabel="PEERS"
          main={{ id: d.ticker, label: d.ticker, sym, color: "#f87171" }}
          pinned={[{ id: "BENCH", label: d.benchmark.label, sym: d.benchmark.sym, color: "#a1a1aa", dashed: true },
            ...peers.map((p, i) => ({ id: `peer:${p}`, label: p, sym: p, color: ["#60a5fa", "#f59e0b", "#f472b6", "#22d3ee"][i] }))]}
          picker={[...d.peers.map((p) => ({ sym: p, label: p, sub: "peer" })), ...held.slice(0, 12).map((h) => ({ sym: h.etf, label: h.etf, sub: `holds ${h.w.toFixed(2)}% · ${h.name}` }))]} />
      </section>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map((g) => (
          <section key={g.t} className={`${CARD} flex flex-col px-5 pb-4 pt-3.5`}>
            <h3 className="m-0 font-mono text-[9.5px] font-bold tracking-[0.2em] text-zinc-500">{g.t}</h3>
            <div className="mt-3 grid grid-cols-2 divide-x divide-white/[0.05]">
              {g.items.map(([k, v, c], i) => (
                <div key={k} className={`flex flex-col gap-1.5 ${i ? "pl-4" : "pr-4"}`}>
                  <span className="font-mono text-[10px] font-semibold tracking-[0.12em] text-zinc-500">{k}</span>
                  <span className={`font-mono text-[20px] font-semibold leading-none tabular-nums ${naTone(v, c ?? "text-zinc-100")}`}>{v}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <section className={`${CARD} flex flex-col gap-3 p-4 lg:col-span-7`}>
          <span className={LABEL}>[ COMPANY ]</span>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[12px] md:grid-cols-3">
            {([["INDUSTRY", d.industry], ["EXCHANGE", d.exchange], ["COUNTRY", d.country], ["SEC CIK", d.cik ? String(d.cik) : null], ["WEBSITE", d.web]] as const).map(([k, v]) => (
              <span key={k} className="flex min-w-0 flex-col"><span className="text-[9.5px] tracking-[0.12em] text-zinc-600">{k}</span>
                {k === "WEBSITE" && v ? <a href={v.startsWith("http") ? v : `https://${v}`} target="_blank" rel="noreferrer" className="truncate text-zinc-200 hover:text-white">{v.replace(/^https?:\/\//, "")}</a> : <span className="truncate text-zinc-200">{v ?? "—"}</span>}
              </span>
            ))}
          </div>
          {d.description && <p className="m-0 line-clamp-4 font-sans text-[12.5px] leading-snug text-zinc-400" title={d.description}>{d.description}</p>}
          {isFund && d.fundHoldings.length > 0 && (
            <div className="flex flex-col gap-1 font-mono text-[11.5px] tabular-nums">
              <span className="text-[9.5px] tracking-[0.12em] text-zinc-600">TOP HOLDINGS</span>
              {d.fundHoldings.slice(0, 10).map((h) => (
                <span key={h.symbol + h.name} className="grid grid-cols-[80px_minmax(0,1fr)_56px] gap-2"><span className="font-bold text-zinc-200">{h.symbol || "—"}</span><span className="truncate font-sans text-zinc-500">{h.name}</span><span className="text-right text-zinc-200">{h.w.toFixed(2)}%</span></span>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9.5px] tracking-[0.12em] text-zinc-600 font-mono">52-WEEK RANGE</span>
            <div className="flex items-center gap-3 font-mono text-[11.5px] tabular-nums">
              <span className="text-zinc-400">{d.lo52 != null ? d.lo52.toFixed(2) : "—"}</span>
              <span className="relative h-1.5 flex-1 bg-white/[0.06]">
                {pos52 != null && <span className="absolute -top-1 h-3.5 w-[3px] bg-emerald-400" style={{ left: `calc(${pos52}% - 1px)` }} />}
              </span>
              <span className="text-zinc-400">{d.hi52 != null ? d.hi52.toFixed(2) : "—"}</span>
            </div>
          </div>
        </section>
        <section className={`${CARD} flex flex-col gap-2 p-4 lg:col-span-5`}>
          <span className={LABEL}>[ PEERS ]</span>
          <div className="flex flex-wrap gap-1.5">
            {d.peers.length ? d.peers.map((p) => (
              <Link key={p} href={`/stock/${p}`} className={`border ${B} bg-[var(--oasis-bg)] px-2.5 py-1 font-mono text-[11.5px] font-bold text-zinc-200 hover:border-white/[0.2] hover:text-white`}>{p}</Link>
            )) : <span className="font-mono text-[11px] text-zinc-600">{d.missing.some((m) => m.startsWith("FINNHUB")) ? "Peers need FINNHUB_API_KEY in .env.local." : "No peers listed."}</span>}
          </div>
          <span className="mt-auto font-mono text-[9.5px] tracking-[0.06em] text-zinc-600">SRC: {d.sources.join(" · ") || "—"}{d.missing.length ? ` · MISSING: ${d.missing.join(", ")}` : ""}</span>
        </section>
      </div>
    </div>
  );
}

/* ═════════════ FINANCIALS ═════════════ */
const RANGES = [4, 8, 12, 20] as const;

/** Quarterly bar chart + the Quant Ruler: hold Ctrl (⌘ on Mac) and drag from one bar to another → Δ value and Δ % between them. */
function Bars({ title, qs, k, sel, onSel, cf, ccy = "USD" }: { title: string; qs: Quarter[]; k: keyof Quarter; sel: string; onSel: (e: string) => void; cf?: boolean; /** filing currency */ ccy?: string }) {
  const vals = qs.map((q) => q[k] as number | null);
  const extra = cf ? qs.map((q) => q.fcf) : [];
  const hi = Math.max(0, ...[...vals, ...extra].map((v) => v ?? 0));
  const lo = Math.min(0, ...[...vals, ...extra].map((v) => v ?? 0));
  const H = 130, PAD = 16, span = hi - lo || 1;
  const y = (v: number) => ((hi - v) / span) * H; // px from the top of the plot
  const zero = y(0);

  /* ── ruler (shared Ctrl + drag measurement hook; T = bar index) ── */
  const boxRef = useRef<HTMLDivElement>(null);
  const { span: ruler, handlers } = useCtrlMeasure<number>((e) => {
    const r = e.currentTarget.getBoundingClientRect(); // handlers sit on the bar box itself
    return Math.min(qs.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * qs.length)));
  });
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([en]) => setBoxW(en.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = ruler ? boxW : 0;
  const cx = (i: number) => ((i + 0.5) / qs.length) * W;
  const va = ruler ? vals[ruler.a] : null, vb = ruler ? vals[ruler.b] : null;
  const delta = va != null && vb != null ? vb - va : null;
  const dPct = va != null && vb != null && va !== 0 ? ((vb - va) / Math.abs(va)) * 100 : null;
  const yv = (v: number | null) => PAD + (v == null ? zero : y(v));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className={LABEL}>{title}</span>
        {cf && <span className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500"><span className="h-[2px] w-3 bg-oasis" />FREE CASH FLOW = OPERATING CF − CAPEX</span>}
      </div>
      <div ref={boxRef} {...handlers}
        className={`relative flex select-none gap-[3px] pt-4 ${ruler?.live ? "cursor-crosshair" : ""}`} style={{ height: H + 46 }}>
        <span className="pointer-events-none absolute inset-x-0 h-px bg-white/[0.12]" style={{ top: PAD + zero }} />
        {qs.map((q) => {
          const v = q[k] as number | null;
          const on = q.end === sel, neg = v != null && v < 0;
          const top = v == null ? zero : Math.min(y(v), zero), h = v == null ? 0 : Math.max(1, Math.abs(y(v) - zero));
          return (
            <button key={q.end} type="button" onClick={() => onSel(q.end)} title={`${q.label}: ${big(v, ccy)}`} className="group relative min-w-0 flex-1" style={{ height: H + 30 }}>
              <span className={`absolute inset-x-0 ${neg ? (on ? "bg-rose-400" : "bg-rose-500/55 group-hover:bg-rose-400/80") : on ? "bg-emerald-400" : "bg-emerald-500/45 group-hover:bg-emerald-400/70"}`} style={{ top, height: h }} />
              {cf && q.fcf != null && <span className="absolute left-[15%] right-[15%] h-[2px] bg-oasis" style={{ top: y(q.fcf) - 1 }} title={`FCF ${big(q.fcf, ccy)}`} />}
              <span className={`absolute inset-x-0 text-center font-mono text-[9px] tabular-nums ${on ? "text-white" : neg ? "text-rose-300/80" : "text-zinc-500"}`} style={{ top: neg ? top + h + 1 : top - 13 }}>{v == null ? "—" : big(v, ccy).replace("$", "").replace(` ${ccy}`, "")}</span>
              <span className={`absolute inset-x-0 -bottom-0 truncate text-center font-mono text-[8.5px] tracking-[0.04em] ${on ? "text-emerald-300" : "text-zinc-600"}`} style={{ top: H + 17 }}>{q.label}</span>
            </button>
          );
        })}

        {/* ── ruler overlay ── */}
        {ruler && W > 0 && (() => {
          const x1 = Math.min(cx(ruler.a), cx(ruler.b)), x2 = Math.max(cx(ruler.a), cx(ruler.b));
          const half = W / qs.length / 2;
          const up = (delta ?? 0) >= 0;
          const accent = up ? "var(--oasis-accent)" : "rgb(251,113,133)";
          const tint = (a: number) => `color-mix(in srgb, ${accent} ${a * 100}%, transparent)`;
          return (
            <>
              <span className="pointer-events-none absolute border-x" style={{ left: x1 - half, width: x2 - x1 + 2 * half, top: PAD, height: H, background: tint(0.08), borderColor: tint(0.5) }} />
              <svg className="pointer-events-none absolute inset-0 overflow-visible" width={W} height={H + 46}>
                <line x1={cx(ruler.a)} y1={yv(va)} x2={cx(ruler.b)} y2={yv(vb)} stroke={accent} strokeWidth={1.5} strokeDasharray="4 3" />
                <circle cx={cx(ruler.a)} cy={yv(va)} r={3} fill={accent} />
                <circle cx={cx(ruler.b)} cy={yv(vb)} r={3} fill={accent} />
              </svg>
              <span className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap border bg-[var(--oasis-bg)] px-2 py-0.5 font-mono text-[10.5px] font-bold tabular-nums"
                style={{ left: Math.min(W - 90, Math.max(90, (x1 + x2) / 2)), top: 0, borderColor: tint(0.6), color: accent }}>
                {qs[ruler.a].label} → {qs[ruler.b].label} · Δ {delta == null ? "—" : `${delta >= 0 ? "+" : "−"}${big(Math.abs(delta), ccy)}`} | {dPct == null ? "—" : `${dPct >= 0 ? "+" : "−"}${Math.abs(dPct).toFixed(1)}%`}
              </span>
            </>
          );
        })()}
      </div>
    </div>
  );
}

/** Plain-language reasons for the quarter's numbers (from the figures themselves — no guessing) */
function whyLines(q: Quarter, prev: Quarter | undefined, yago: Quarter | undefined, ccy = "USD", annualFin = false): string[] {
  const big = (v: number | null | undefined) => formatMarketValue(v, ccy, { compact: true, digits: 0 });
  const per = annualFin ? "year" : "quarter";
  const out: string[] = [];
  const revY = chgOf(q.revenue, yago?.revenue ?? null), revQ = chgOf(q.revenue, prev?.revenue ?? null);
  if (revY != null) out.push(`Revenue ${revY >= 0 ? "grew" : "fell"} ${Math.abs(revY).toFixed(1)}% vs the ${annualFin ? "prior year" : "same quarter last year"} (${big((q.revenue ?? 0) - (yago?.revenue ?? 0))})${revQ != null && !annualFin ? ` and ${revQ >= 0 ? "rose" : "dropped"} ${Math.abs(revQ).toFixed(1)}% vs the previous quarter` : ""}.`);
  const gm = q.grossProfit != null && q.revenue ? (q.grossProfit / q.revenue) * 100 : null;
  const gmY = yago?.grossProfit != null && yago.revenue ? (yago.grossProfit / yago.revenue) * 100 : null;
  if (gm != null && gmY != null) out.push(`Gross margin ${gm >= gmY ? "widened" : "narrowed"} from ${gmY.toFixed(1)}% to ${gm.toFixed(1)}% (${gm - gmY >= 0 ? "+" : "−"}${Math.abs(gm - gmY).toFixed(1)} pp) — ${gm >= gmY ? "each dollar of sales keeps more profit (pricing / mix / lower costs)" : "costs of producing sales grew faster than revenue"}.`);
  const opex = q.grossProfit != null && q.operatingIncome != null ? q.grossProfit - q.operatingIncome : null;
  const opexY = yago?.grossProfit != null && yago.operatingIncome != null ? yago.grossProfit - yago.operatingIncome : null;
  const opexG = chgOf(opex, opexY);
  if (opexG != null && revY != null) out.push(`Operating expenses (R&D, sales, admin) ${opexG >= 0 ? "rose" : "fell"} ${Math.abs(opexG).toFixed(1)}% y/y — ${opexG < revY ? "slower than revenue, so operating profit gained leverage" : "faster than revenue, which squeezed operating profit"}.`);
  if (q.netIncome != null && q.operatingIncome != null) {
    const gap = q.netIncome - q.operatingIncome;
    if (Math.abs(gap) > Math.abs(q.operatingIncome) * 0.15) out.push(`Net result is ${big(Math.abs(gap))} ${gap > 0 ? "above" : "below"} operating profit — ${gap > 0 ? "interest / investment gains or a tax benefit added to it" : "taxes, interest costs or one-off charges took a bite"}.`);
  }
  if (q.netIncome != null && q.netIncome < 0) out.push(`The ${per} ended with a LOSS of ${big(-q.netIncome)}${q.operatingIncome != null && q.operatingIncome < 0 ? " — the core business itself lost money (operating loss)" : " even though the core business was profitable"}.`);
  const niY = chgOf(q.netIncome, yago?.netIncome ?? null);
  if (niY != null && q.netIncome != null && q.netIncome > 0 && (yago?.netIncome ?? 0) > 0) out.push(`Net profit ${niY >= 0 ? "up" : "down"} ${Math.abs(niY).toFixed(1)}% y/y.`);
  if (q.ocf != null && q.netIncome != null && q.netIncome > 0) {
    const conv = q.ocf / q.netIncome;
    out.push(`Cash conversion ${conv.toFixed(2)}× — operating cash flow was ${conv >= 1 ? "above" : "below"} reported profit${conv < 0.8 ? " (cash tied up in inventory / receivables)" : conv > 1.3 ? " (non-cash costs and working capital released cash)" : ""}.`);
  }
  if (q.fcf != null) out.push(`Free cash flow ${big(q.fcf)}${q.capex != null ? ` after ${big(q.capex)} of capital spending` : ""}.`);
  return out;
}

function matchEarnings(q: Quarter, rows: EarningsRow[]) {
  const t = Date.parse(q.end);
  return rows.find((r) => Math.abs(Date.parse(r.period) - t) < 25 * 864e5) ?? null;
}

function Financials({ d }: { d: StockData }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(8);
  const qs = d.quarters.slice(-range);
  const [sel, setSel] = useState<string | null>(null);
  const cur = qs.find((q) => q.end === sel) ?? qs[qs.length - 1];
  if (!d.quarters.length) {
    return <p className={`${CARD} m-5 p-5 font-mono text-[12px] text-zinc-500`}>No XBRL financial statements found for {d.ticker} — SEC data covers companies filing 10-Q / 10-K (US) or 20-F / 40-F (foreign issuers, annual only). Warsaw / non-SEC listings are not covered yet.{d.missing.length ? ` (missing: ${d.missing.join(", ")})` : ""}</p>;
  }
  const annualFin = d.finPeriod === "annual", fc = d.finCurrency;
  const i = d.quarters.findIndex((q) => q.end === cur.end);
  // annual filers: every row is a year, so "y/y" is the previous row
  const prev = d.quarters[i - 1], yago = annualFin ? d.quarters[i - 1] : d.quarters[i - 4];
  const er = matchEarnings(cur, d.earnings);
  const rows: [string, number | null, number | null, number | null, boolean?][] = [
    ["REVENUE", cur.revenue, prev?.revenue ?? null, yago?.revenue ?? null],
    ["GROSS PROFIT", cur.grossProfit, prev?.grossProfit ?? null, yago?.grossProfit ?? null],
    ["OPERATING INCOME", cur.operatingIncome, prev?.operatingIncome ?? null, yago?.operatingIncome ?? null],
    ["NET INCOME", cur.netIncome, prev?.netIncome ?? null, yago?.netIncome ?? null],
    ["EPS (DILUTED)", cur.eps, prev?.eps ?? null, yago?.eps ?? null, true],
    ["OPERATING CASH FLOW", cur.ocf, prev?.ocf ?? null, yago?.ocf ?? null],
    ["CAPEX", cur.capex, prev?.capex ?? null, yago?.capex ?? null],
    ["FREE CASH FLOW", cur.fcf, prev?.fcf ?? null, yago?.fcf ?? null],
  ];
  const margin = (a: number | null) => (a != null && cur.revenue ? `${((a / cur.revenue) * 100).toFixed(1)}%` : "—");
  return (
    <div className="flex flex-col gap-4 px-5 pb-12 pt-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* left: the series */}
        <section className={`${CARD} flex flex-col gap-5 p-4`}>
          <div className="flex items-center gap-2">
            <span className={`${LABEL} text-zinc-300`}>[ {annualFin ? "ANNUAL" : "QUARTERLY"} RESULTS ]</span>
            {(annualFin || fc !== "USD") && <span className="border border-oasis/40 px-1.5 font-mono text-[9.5px] font-bold tracking-[0.1em] text-oasis" title="Currency the company reports its financial statements in">[ REPORTED IN {fc} ]</span>}
            <span className="ml-auto font-mono text-[9.5px] tracking-[0.1em] text-zinc-600">CLICK = {annualFin ? "YEAR" : "QUARTER"} · <span className="text-oasis">CTRL + DRAG = MEASURE</span></span>
          </div>
          <Bars ccy={fc} title="REVENUE" qs={qs} k="revenue" sel={cur.end} onSel={setSel} />
          <Bars ccy={fc} title="NET INCOME · PROFIT / LOSS" qs={qs} k="netIncome" sel={cur.end} onSel={setSel} />
          <Bars ccy={fc} title="OPERATING CASH FLOW" qs={qs} k="ocf" sel={cur.end} onSel={setSel} cf />
          <div className={`mt-auto flex flex-wrap items-center gap-3 border-t ${B} pt-3`}>
            <span className="flex gap-1">
              {RANGES.map((r) => (
                <button key={r} type="button" onClick={() => setRange(r)} className={`h-6 border px-2 font-mono text-[10px] font-bold ${range === r ? "oasis-on" : `${B} text-zinc-500 hover:text-zinc-200`}`}>[ {annualFin ? `${r}Y` : r === 20 ? "5Y" : `${r}Q`} ]</button>
              ))}
            </span>
            <span className="ml-auto font-mono text-[9.5px] tracking-[0.06em] text-zinc-600">{annualFin ? "SRC: SEC 20-F (XBRL) · FOREIGN FILER — QUARTERLY 6-K REPORTS ARE NOT XBRL-TAGGED" : "SRC: SEC 10-Q / 10-K (XBRL) · Q4 & CASH-FLOW QUARTERS DERIVED FROM YTD TOTALS"}</span>
          </div>
        </section>

        {/* right: the selected quarter, explained */}
        <section className={`${CARD} flex flex-col gap-3 p-4`}>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[18px] font-bold text-white">{cur.label}</span>
            <span className="font-mono text-[10.5px] text-zinc-500">PERIOD ENDED {cur.end}</span>
            {cur.netIncome != null && <span className={`ml-auto border px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.1em] ${cur.netIncome >= 0 ? "border-emerald-500/40 text-emerald-300" : "border-rose-500/40 text-rose-300"}`}>{cur.netIncome >= 0 ? "PROFIT" : "LOSS"}</span>}
          </div>
          <table className="w-full border-collapse font-mono text-[12px] tabular-nums">
            <thead><tr className={`border-b ${B} text-[9.5px] tracking-[0.12em] text-zinc-600`}><th className="py-1.5 text-left font-semibold">LINE</th><th className="py-1.5 text-right font-semibold">VALUE</th><th className="py-1.5 text-right font-semibold">MARGIN</th>{!annualFin && <th className="py-1.5 text-right font-semibold">Q/Q</th>}<th className="py-1.5 text-right font-semibold">Y/Y</th></tr></thead>
            <tbody>
              {rows.map(([k, v, p, y, isEps]) => (
                <tr key={k} className={`border-b ${B}`}>
                  <td className="py-1.5 text-[10.5px] tracking-[0.06em] text-zinc-400">{k}</td>
                  <td className={`py-1.5 text-right font-semibold ${v != null && v < 0 ? "text-rose-400" : "text-zinc-100"}`}>{isEps ? formatMarketValue(v, fc) : big(v, fc)}</td>
                  <td className="py-1.5 text-right text-zinc-500">{isEps || k === "REVENUE" ? "" : margin(v)}</td>
                  {!annualFin && <td className={`py-1.5 text-right ${tone(chgOf(v, p))}`}>{pct(chgOf(v, p))}</td>}
                  <td className={`py-1.5 text-right ${tone(chgOf(v, y))}`}>{pct(chgOf(v, y))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* earnings brief — terminal note */}
          {(() => {
            const e = er ?? d.earnings[0] ?? null;
            const sorted = [...d.earnings].sort((x, y) => y.period.localeCompare(x.period)).slice(0, 4);
            const verdict = (r: EarningsRow) => (r.surprisePct == null ? "" : `${r.surprisePct >= 0 ? "Beat" : "Miss"} ${pct(r.surprisePct)}`);
            const revY = chgOf(cur.revenue, yago?.revenue ?? null);
            const gm = cur.grossProfit != null && cur.revenue ? (cur.grossProfit / cur.revenue) * 100 : null;
            const gmY = yago?.grossProfit != null && yago.revenue ? (yago.grossProfit / yago.revenue) * 100 : null;
            const note = [
              revY != null ? `revenue ${revY >= 0 ? "+" : "−"}${Math.abs(revY).toFixed(0)}% y/y` : null,
              gm != null && gmY != null ? `${gm >= gmY ? "margins expanding" : "margins under pressure"} (${gm.toFixed(1)}% gross)` : null,
              cur.netIncome != null ? (cur.netIncome >= 0 ? "profitable quarter" : "loss-making quarter") : null,
            ].filter(Boolean).join(", ");
            return (
              <div className={`flex flex-col gap-1 border ${B} bg-[var(--oasis-bg)] px-3 py-2.5 font-mono text-[11.5px] leading-relaxed tabular-nums`}>
                <span className="text-[10px] font-bold tracking-[0.14em] text-zinc-300">[ {er ? "EARNINGS BRIEF · " + cur.label : "LATEST EARNINGS BRIEF"} ]</span>
                {e ? (
                  <>
                    <span className="text-zinc-200">EPS: <span className="font-bold text-white">{e.actual != null ? `$${e.actual.toFixed(2)}` : "—"}</span>
                      {e.surprisePct != null && <span className={`font-bold ${tone(e.surprisePct)}`}> ({verdict(e)})</span>}
                      <span className="text-zinc-500"> | EST: </span>{e.estimate != null ? `$${e.estimate.toFixed(2)}` : "—"}
                      <span className="text-zinc-600"> · {e.quarter ? `Q${e.quarter} ${e.year}` : e.period}</span></span>
                    {note && <span className="text-zinc-400">NOTE: <span className="text-zinc-300">{note.charAt(0).toUpperCase() + note.slice(1)}.</span></span>}
                    {sorted.length > 1 && (
                      <span className="mt-1 flex flex-col text-[10.5px] text-zinc-500">
                        {sorted.map((r) => (
                          <span key={r.period} className="grid grid-cols-[70px_90px_90px_1fr] gap-2">
                            <span>{r.quarter ? `Q${r.quarter} ${r.year}` : r.period}</span>
                            <span>EST {r.estimate != null ? `$${r.estimate.toFixed(2)}` : "—"}</span>
                            <span>ACT {r.actual != null ? `$${r.actual.toFixed(2)}` : "—"}</span>
                            <span className={tone(r.surprisePct)}>{verdict(r).toUpperCase()}</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-zinc-600">EPS estimates need FINNHUB_API_KEY in .env.local (free key at finnhub.io).</span>
                )}
              </div>
            );
          })()}
          <div className="flex flex-col gap-1.5">
            <span className={LABEL}>[ WHY ]</span>
            {whyLines(cur, prev, yago, fc, annualFin).map((l, k) => (
              <p key={k} className="m-0 flex gap-2 font-sans text-[13px] leading-snug text-zinc-200"><span className="font-mono text-emerald-400">›</span>{l}</p>
            ))}
            <span className="font-mono text-[9.5px] tracking-[0.06em] text-zinc-600">COMPUTED FROM THE REPORTED FIGURES · NOT ADVICE</span>
          </div>
        </section>
      </div>

    </div>
  );
}

/* ═════════════ CHARTS ═════════════ */
type Raw = { t: number[]; c: number[] };
function useSeries(sym: string, range: string) {
  const [s, setS] = useState<{ k: string; v: Raw | null } | null>(null);
  const k = `${sym}|${range}`;
  useEffect(() => {
    let off = false;
    fetch(`/api/prices?symbols=${sym}&range=${range}`).then((r) => r.json()).then((j) => { if (!off) setS({ k, v: j.series?.[sym] ?? null }); }).catch(() => { if (!off) setS({ k, v: null }); });
    return () => { off = true; };
  }, [k, sym, range]);
  return s?.k === k ? s.v : undefined;
}
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function Charts({ d, sym }: { d: StockData; sym: string }) {
  const weekly = useSeries(sym, "5y");
  const daily = useSeries(sym, "2y");
  const seas = useMemo(() => {
    if (!weekly) return null;
    const last = new Map<string, number>(); // YYYY-MM → last close
    weekly.t.forEach((t, i) => { const x = new Date(t * 1000); last.set(`${x.getUTCFullYear()}-${x.getUTCMonth()}`, weekly.c[i]); });
    const keys = [...last.keys()];
    const rows = new Map<number, (number | null)[]>();
    for (let i = 1; i < keys.length; i++) {
      const [y, m] = keys[i].split("-").map(Number);
      const r = rows.get(y) ?? Array(12).fill(null);
      r[m] = (last.get(keys[i])! / last.get(keys[i - 1])! - 1) * 100;
      rows.set(y, r);
    }
    return [...rows.entries()].sort((a, b) => a[0] - b[0]);
  }, [weekly]);
  const react = useMemo(() => {
    if (!daily) return null;
    return d.earningsDates.map((ds) => {
      const t = Date.parse(ds) / 1000;
      const before = daily.t.findLastIndex((x) => x < t);
      const after = daily.t.findIndex((x) => x > t + 86400 * 0.5);
      if (before < 0 || after < 0) return null;
      return { date: ds, r: (daily.c[after] / daily.c[before] - 1) * 100 };
    }).filter((x): x is { date: string; r: number } => !!x).reverse();
  }, [daily, d.earningsDates]);
  const heat = (v: number | null) => {
    if (v == null) return { background: "transparent", color: "#3f3f46" };
    const a = Math.min(1, Math.abs(v) / 15) * 0.4 + 0.08;
    return { background: v >= 0 ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})`, color: "#e4e4e7" };
  };
  const maxR = Math.max(...(react ?? []).map((x) => Math.abs(x.r)), 1);
  return (
    <div className="grid grid-cols-1 gap-4 px-5 pb-12 pt-5 xl:grid-cols-2">
      <section className={`${CARD} flex flex-col gap-3 p-4`}>
        <span className={`${LABEL} text-zinc-300`}>[ SEASONALITY · MONTHLY RETURN % ]</span>
        {seas === null ? <div className="h-[200px] animate-pulse bg-white/[0.02]" /> : (
          <table className="w-full border-collapse font-mono text-[10.5px] tabular-nums">
            <thead><tr className="text-zinc-600"><th className="py-1 text-left">YEAR</th>{MON.map((m) => <th key={m} className="py-1">{m}</th>)}</tr></thead>
            <tbody>
              {seas.map(([y, ms]) => (
                <tr key={y}><td className="py-[3px] pr-2 text-zinc-400">{y}</td>
                  {ms.map((v, i) => <td key={i} className="border border-[var(--oasis-panel)] py-[5px] text-center" style={heat(v)}>{v == null ? "·" : v.toFixed(1)}</td>)}
                </tr>
              ))}
              <tr className="border-t border-white/[0.08]"><td className="py-1 pr-2 text-zinc-500">AVG</td>
                {MON.map((_, i) => { const vs = seas.map(([, ms]) => ms[i]).filter((v): v is number => v != null); const a = vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : null; return <td key={i} className={`py-1 text-center font-bold ${tone(a)}`}>{a == null ? "·" : a.toFixed(1)}</td>; })}
              </tr>
            </tbody>
          </table>
        )}
        <span className="font-mono text-[9.5px] tracking-[0.06em] text-zinc-600">REAL PRICES · 5Y WEEKLY CLOSES · PAST PATTERNS DON&apos;T PREDICT</span>
      </section>
      <section className={`${CARD} flex flex-col gap-3 p-4`}>
        <span className={`${LABEL} text-zinc-300`}>[ PRICE REACTION TO EARNINGS ]</span>
        {react === null ? <div className="h-[200px] animate-pulse bg-white/[0.02]" /> : react.length ? (
          <div className="flex flex-col gap-1.5">
            {react.map((x) => (
              <div key={x.date} className="grid grid-cols-[86px_minmax(0,1fr)_64px] items-center gap-3 font-mono text-[11.5px] tabular-nums">
                <span className="text-zinc-400">{x.date}</span>
                <span className="relative h-3"><span className="absolute inset-y-0 left-1/2 w-px bg-white/[0.12]" />
                  <span className={`absolute inset-y-[2px] ${x.r >= 0 ? "left-1/2 bg-emerald-400/80" : "right-1/2 bg-rose-400/80"}`} style={{ width: `${(Math.abs(x.r) / maxR) * 50}%` }} /></span>
                <span className={`text-right font-bold ${tone(x.r)}`}>{pct(x.r, 2)}</span>
              </div>
            ))}
            <span className="mt-1 font-mono text-[10px] text-zinc-500">AVG MOVE {pct(react.reduce((a, x) => a + Math.abs(x.r), 0) / react.length, 2).replace("+", "±")} · UP {react.filter((x) => x.r > 0).length}/{react.length}</span>
          </div>
        ) : <p className="m-0 font-mono text-[11px] text-zinc-600">No results releases (8-K item 2.02) found in the last 2 years.</p>}
        <span className="font-mono text-[9.5px] tracking-[0.06em] text-zinc-600">CLOSE BEFORE → FIRST CLOSE AFTER EACH RESULTS RELEASE (SEC 8-K 2.02)</span>
      </section>
    </div>
  );
}

/* ═════════════ IN ETFS ═════════════ */
function InEtfs({ d, held }: { d: StockData; held: { etf: string; name: string; w: number }[] }) {
  const mine = useMyPortfolio();
  const direct = mine.find((p) => p.asset.ticker === d.ticker)?.weight ?? 0;
  const total = useMemo(() => lookThrough(mine)[d.ticker === "GOOG" ? "GOOGL" : d.ticker] ?? 0, [mine, d.ticker]);
  const via = mine.filter((p) => p.asset.kind === "etf").map((p) => ({ p, w: held.find((h) => h.etf === p.asset.ticker)?.w ?? 0 })).filter((x) => x.w > 0);
  const max = Math.max(...held.map((h) => h.w), 1);
  return (
    <div className="grid grid-cols-1 gap-4 px-5 pb-12 pt-5 xl:grid-cols-12">
      <section className={`${CARD} flex flex-col p-4 xl:col-span-8`}>
        <span className={`${LABEL} mb-2 text-zinc-300`}>[ ETFS HOLDING {d.ticker} · {held.length} ]</span>
        {held.length === 0 && (
          <p className="m-0 py-3 font-mono text-[11.5px] leading-relaxed text-zinc-500">
            None of the {ETFS.length} ETFs in the OASIS database lists {d.ticker} among its tracked holdings. Fund profiles cover each ETF&apos;s largest positions,
            so funds that hold {d.ticker} as a small weight (e.g. broad communication-services or total-market ETFs outside the database) are not shown.
          </p>
        )}
        {held.map((h) => (
          <Link key={h.etf} href={`/etf/${h.etf}`} className={`grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1.2fr)_64px] items-center gap-3 border-b ${B} py-2 font-mono text-[12px] tabular-nums hover:bg-white/[0.03]`}>
            <span className="font-bold text-zinc-100">{h.etf}</span>
            <span className="truncate font-sans text-zinc-400">{h.name}</span>
            <span className="h-2 bg-white/[0.04]"><span className="block h-full bg-emerald-500/60" style={{ width: `${(h.w / max) * 100}%` }} /></span>
            <span className="text-right font-semibold text-zinc-100">{h.w.toFixed(2)}%</span>
          </Link>
        ))}
        {!held.length && <p className="m-0 font-mono text-[11px] text-zinc-600">None of the ETFs in our database list {d.ticker} among their holdings.</p>}
      </section>
      <section className={`${CARD} flex flex-col gap-3 p-4 xl:col-span-4`}>
        <span className={`${LABEL} text-zinc-300`}>[ MY EXPOSURE ]</span>
        <div className="flex items-baseline gap-2 font-mono"><span className="text-[28px] font-bold tabular-nums text-white">{total.toFixed(2)}%</span><span className="text-[10.5px] text-zinc-500">OF MY PORTFOLIO</span></div>
        <div className="flex flex-col gap-1 font-mono text-[11.5px] tabular-nums">
          <span className="flex justify-between"><span className="text-zinc-500">DIRECT</span><span className="text-zinc-200">{direct.toFixed(2)}%</span></span>
          {via.map(({ p, w }) => <span key={p.asset.ticker} className="flex justify-between"><span className="text-zinc-500">VIA {p.asset.ticker} ({w.toFixed(2)}% × {p.weight}%)</span><span className="text-zinc-200">{((w * p.weight) / 100).toFixed(2)}%</span></span>)}
          {!mine.length && <span className="text-zinc-600">No portfolio saved yet.</span>}
        </div>
      </section>
    </div>
  );
}

/* ═════════════ PAGE ═════════════ */
export default function StockDeepView({ ticker, yahoo = ticker }: { ticker: string; /** Yahoo symbol (e.g. CDR.WA) */ yahoo?: string }) {
  const router = useRouter();
  const [tabPick, setTab] = useState<Tab>("OV");
  const [st, setSt] = useState<{ t: string; d: StockData | null; err?: string } | null>(null);
  useEffect(() => {
    let off = false;
    fetch(`/api/stock/${ticker}?y=${encodeURIComponent(yahoo)}`).then((r) => r.json()).then((d) => { if (!off) setSt(d.error ? { t: ticker, d: null, err: d.error } : { t: ticker, d }); }).catch(() => { if (!off) setSt({ t: ticker, d: null, err: "Data unavailable" }); });
    return () => { off = true; };
  }, [ticker, yahoo]);
  const d = st?.t === ticker ? st.d : null;
  const held = useMemo(() => holders(ticker), [ticker]);
  /* name from an imported (XTB) position — browser storage, so only after mount */
  const [localName, setLocalName] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read from browser storage
    setLocalName(getAsset(ticker)?.name ?? null);
  }, [ticker]);
  const live = useSnapshot([yahoo])[yahoo];
  const w = useWatchlist();
  const fav = w.favorites.includes(ticker);
  const inPf = w.portfolio.find((p) => p.ticker === ticker);
  const price = live?.price ?? d?.price ?? null, chg = live?.chg1d ?? d?.chg1d ?? null;
  const tabs = !d ? LOADING_TABS : isFundData(d) ? FUND_TABS : STOCK_TABS;
  // a tab that does not exist for this asset type (e.g. IN ETFS on a fund) falls back to the overview
  const tab: Tab = tabs.some(([k]) => k === tabPick) ? tabPick : "OV";
  const ccy = currencyOf(yahoo, { currency: live?.currency ?? d?.currency, exchange: d?.exchange });
  const newsItems = useMemo(() => [{ ticker, name: d?.name ?? ticker, weight: 100, kind: "stock" as const, sector: d?.industry ?? "Other" }], [ticker, d?.name, d?.industry]);

  return (
    <div className="flex min-h-full min-w-0 flex-col bg-[var(--oasis-bg)] text-zinc-200">
      <header className={`flex flex-col gap-3 border-b ${B} px-5 pt-3.5`}>
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push("/scanner"))} className="font-mono text-[11px] font-semibold tracking-[0.14em] text-gray-500 hover:text-white">[ ← BACK ]</button>
          <span className="font-mono text-[10px] tracking-[0.12em] text-gray-600">STOCKS / {d?.industry?.toUpperCase() ?? "…"} / <span className="text-gray-400">{ticker}</span></span>
        </div>
        <div className="flex flex-wrap items-end gap-x-[22px] gap-y-2.5">
          <span className="text-[56px] font-bold leading-[0.82] tracking-[0.01em] text-white">{ticker}</span>
          <span className="pb-0.5 text-xl font-medium tracking-[0.02em] text-neutral-400">{(d?.name && d.name !== ticker ? d.name : localName ?? d?.name) ?? (st ? "" : "…")}</span>
          <div className="ml-auto flex items-baseline gap-3 font-mono tabular-nums">
            <span className={`text-[30px] font-semibold ${price == null ? NA_CLASS : "text-neutral-100"}`}>{formatMarketValue(price, ccy)}</span>
            <span className={`text-[13px] font-bold ${tone(chg)}`}>{pct(chg, 2)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 py-0.5">
          <span className="flex h-7 items-center whitespace-nowrap border border-oasis/50 bg-oasis-muted px-2.5 font-mono text-[11px] font-bold tracking-[0.12em] text-oasis" title="All prices and money values on this page are in this currency">[ CURRENCY: {ccy} ]</span>
          {([["MARKET CAP", big(d?.marketCap, ccy)], ["P/E", fmtRatio(d?.pe, 1)], ["INDUSTRY", d?.industry ?? "—"], ["EXCHANGE", d?.exchange ?? "—"]] as const).map(([k, v]) => (
            <div key={k} className="flex h-7 items-center gap-2 whitespace-nowrap rounded-sm border border-white/[0.05] px-3">
              <span className="text-[10.5px] font-semibold tracking-[0.12em] text-gray-400">{k}:</span>
              <span className={`font-mono text-xs font-semibold ${naTone(v, "text-neutral-100")}`}>{v}</span>
            </div>
          ))}
          {inPf && <span className="h-7 border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10.5px] font-bold text-emerald-300">★ IN MY PORTFOLIO · {inPf.weight}%</span>}
          <button type="button" onClick={() => toggleFavorite(ticker)} className={`ml-auto h-7 border px-2.5 font-mono text-[10.5px] font-bold tracking-[0.1em] ${fav ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-white/[0.08] text-zinc-400 hover:text-white"}`}>[ {fav ? "★ SAVED" : "☆ FAVORITE"} ]</button>
        </div>
        <nav className="mt-1 flex flex-wrap gap-x-8">
          {tabs.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`-mb-px whitespace-nowrap border-b-2 pb-2.5 pt-2 font-mono text-[13px] font-semibold uppercase tracking-[0.06em] ${tab === k ? "oasis-tab" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
              [ {l} ]
            </button>
          ))}
        </nav>
      </header>

      {!d ? (
        st?.err ? <p className="m-5 font-mono text-[12px] text-rose-400">⚠ {st.err}</p> : <div className="m-5 h-[520px] animate-pulse rounded-sm bg-white/[0.02]" />
      ) : (
        <>
          {tab === "OV" && <Overview d={d} held={held} sym={yahoo} />}
          {tab === "FIN" && <Financials d={d} />}
          {tab === "COMP" && <FundComposition d={d} sym={yahoo} />}
          {tab === "CH" && <Charts d={d} sym={yahoo} />}
          {tab === "NEWS" && <div className="px-5 pb-12 pt-5"><EtfNewsPanel ticker={ticker} items={newsItems} /></div>}
          {tab === "ETF" && <InEtfs d={d} held={held} />}
        </>
      )}
    </div>
  );
}
