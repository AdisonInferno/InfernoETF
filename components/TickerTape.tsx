"use client";

/* MARKETS strip under the main menu — a stable, in-place updating row (no crawl).
   Live values from Yahoo via the shared market snapshot (refreshes every minute).
   Each cell states what it shows: LEVEL (index points / price), 1D and YTD % change — or, for
   government bond yields, the yield in % and its change in basis points.
   Users pick the indicators (⚙) and can collapse the strip; both are remembered (localStorage). */
import { useState } from "react";
import { snapLoaded, useSnapshot, type Snap } from "@/lib/market-snapshot";
import { usePersisted } from "@/lib/persisted";

type Flag = "us" | "de" | "eu" | "jp";
type Kind = "index" | "price" | "yield";

interface Indicator {
  id: string;
  label: string;
  /** Yahoo symbol */
  sym: string;
  kind: Kind;
  /** currency prefix for prices */
  unit?: string;
  flag?: Flag;
  group: "EQUITY" | "RATES" | "MACRO";
  /** shown on hover — what the number is */
  hint: string;
}

const INDICATORS: Indicator[] = [
  { id: "spx", label: "S&P 500", sym: "^GSPC", kind: "index", flag: "us", group: "EQUITY", hint: "S&P 500 index level (points)" },
  { id: "world", label: "MSCI WORLD", sym: "URTH", kind: "price", unit: "$", group: "EQUITY", hint: "MSCI World via the iShares MSCI World ETF (URTH) price — an ETF proxy, not the index level" },
  { id: "ndx", label: "NASDAQ", sym: "^IXIC", kind: "index", flag: "us", group: "EQUITY", hint: "Nasdaq Composite index level (points)" },
  { id: "sx5e", label: "EURO STOXX 50", sym: "^STOXX50E", kind: "index", flag: "eu", group: "EQUITY", hint: "Euro Stoxx 50 index level (points)" },
  { id: "dax", label: "DAX", sym: "^GDAXI", kind: "index", flag: "de", group: "EQUITY", hint: "DAX index level (points)" },
  { id: "nikkei", label: "NIKKEI", sym: "^N225", kind: "index", flag: "jp", group: "EQUITY", hint: "Nikkei 225 index level (points)" },
  { id: "us3m", label: "US 3M", sym: "^IRX", kind: "yield", group: "RATES", hint: "13-week US Treasury bill yield, %" },
  { id: "us5y", label: "US 5Y", sym: "^FVX", kind: "yield", group: "RATES", hint: "5-year US Treasury yield, %" },
  { id: "us10y", label: "US 10Y", sym: "^TNX", kind: "yield", group: "RATES", hint: "10-year US Treasury yield, %" },
  { id: "us30y", label: "US 30Y", sym: "^TYX", kind: "yield", group: "RATES", hint: "30-year US Treasury yield, %" },
  { id: "vix", label: "VIX", sym: "^VIX", kind: "index", group: "MACRO", hint: "CBOE volatility index (implied S&P 500 volatility, points)" },
  { id: "usd", label: "USD INDEX", sym: "DX-Y.NYB", kind: "index", group: "MACRO", hint: "US Dollar Index (DXY) level" },
  { id: "gold", label: "GOLD", sym: "GC=F", kind: "price", unit: "$", group: "MACRO", hint: "Gold front-month future, $ per troy ounce" },
  { id: "silver", label: "SILVER", sym: "SI=F", kind: "price", unit: "$", group: "MACRO", hint: "Silver front-month future, $ per troy ounce" },
  { id: "copper", label: "COPPER", sym: "HG=F", kind: "price", unit: "$", group: "MACRO", hint: "Copper front-month future, $ per pound" },
  { id: "oil", label: "CRUDE OIL", sym: "CL=F", kind: "price", unit: "$", group: "MACRO", hint: "WTI crude front-month future, $ per barrel" },
  { id: "gas", label: "NAT GAS", sym: "NG=F", kind: "price", unit: "$", group: "MACRO", hint: "Henry Hub natural gas front-month future, $ per MMBtu" },
];

/** Long-term investor default: broad equity, rates, then a few macro gauges. */
const DEFAULT_IDS = ["spx", "world", "ndx", "sx5e", "nikkei", "us10y", "us30y", "vix", "usd", "oil", "gold", "silver"];
const PREF_KEY = "oasis.markets.v2"; // v2: new defaults (Nikkei, crude oil, silver)
const DEFAULT_PREF: { ids: string[]; collapsed: boolean } = { ids: DEFAULT_IDS, collapsed: false };

/* Inline SVG flags — Windows does not render flag emoji. */
function FlagIcon({ flag }: { flag: Flag }) {
  const common = { width: 16, height: 11, className: "flex-none rounded-xs" } as const;
  switch (flag) {
    case "us":
      return (
        <svg {...common} viewBox="0 0 18 12">
          <rect width="18" height="12" fill="#fff" />
          {[0, 2, 4, 6, 8, 10].map((y) => <rect key={y} y={y} width="18" height="1" fill="#b22234" />)}
          <rect width="8" height="6.5" fill="#3c3b6e" />
        </svg>
      );
    case "de":
      return (
        <svg {...common} viewBox="0 0 18 12">
          <rect width="18" height="4" fill="#000" />
          <rect y="4" width="18" height="4" fill="#dd0000" />
          <rect y="8" width="18" height="4" fill="#ffce00" />
        </svg>
      );
    case "eu":
      return (
        <svg {...common} viewBox="0 0 18 12">
          <rect width="18" height="12" fill="#003399" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <circle key={i} cx={(9 + Math.cos(a) * 3.6).toFixed(3)} cy={(6 + Math.sin(a) * 3.6).toFixed(3)} r="0.55" fill="#ffcc00" />;
          })}
        </svg>
      );
    case "jp":
      return (
        <svg {...common} viewBox="0 0 18 12">
          <rect width="18" height="12" fill="#fff" />
          <circle cx="9" cy="6" r="3.4" fill="#bc002d" />
        </svg>
      );
  }
}

const num = (v: number, d = 2) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "%";
const tone = (v: number) => (v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-400");

/** Value cells for one indicator. Yields: level in %, changes in basis points (derived from the same snapshot). */
function cells(it: Indicator, s: Snap) {
  if (it.kind === "yield") {
    const prev = s.price / (1 + s.chg1d / 100);
    const base = s.ytd != null ? s.price / (1 + s.ytd / 100) : null;
    const bp = (d: number) => (d >= 0 ? "+" : "−") + Math.abs(Math.round(d * 100)) + "bp";
    return {
      level: num(s.price) + "%",
      d1: { text: bp(s.price - prev), v: s.price - prev },
      ytd: base != null ? { text: bp(s.price - base), v: s.price - base } : null,
    };
  }
  return {
    level: (it.unit ?? "") + num(s.price),
    d1: { text: pct(s.chg1d), v: s.chg1d },
    ytd: s.ytd != null ? { text: pct(s.ytd), v: s.ytd } : null,
  };
}

function Cell({ it, s, compact }: { it: Indicator; s: Snap | null | undefined; compact: boolean }) {
  const c = s ? cells(it, s) : null;
  const status = s === undefined ? "loading…" : s === null ? "live quote unavailable" : null;
  return (
    <div title={`${it.hint}${status ? ` — ${status}` : ""}`}
      className={`flex flex-none items-center gap-2 border-r border-white/[0.06] font-mono tabular-nums whitespace-nowrap ${compact ? "px-3 text-[10.5px]" : "px-4 text-[11.5px]"}`}>
      {it.flag && !compact && <FlagIcon flag={it.flag} />}
      <span className="text-zinc-500">{it.label}</span>
      {!c ? (
        <span className="text-zinc-600">{s === undefined ? "···" : "N/A"}</span>
      ) : (
        <>
          {/* key = value → the number re-mounts on a new quote and plays one short, soft highlight */}
          {!compact && <span key={c.level} className="animate-quote-flash rounded-xs px-0.5 font-semibold text-zinc-100">{c.level}</span>}
          <span className="flex items-baseline gap-1">
            <span className="text-[9px] tracking-[0.08em] text-zinc-600">1D</span>
            <span className={tone(c.d1.v)}>{c.d1.text}</span>
          </span>
          {!compact && c.ytd && (
            <span className="flex items-baseline gap-1">
              <span className="text-[9px] tracking-[0.08em] text-zinc-600">YTD</span>
              <span className={tone(c.ytd.v)}>{c.ytd.text}</span>
            </span>
          )}
        </>
      )}
    </div>
  );
}

export default function TickerTape() {
  const [pref, setPref] = usePersisted(PREF_KEY, DEFAULT_PREF);
  const [menu, setMenu] = useState(false);
  const shown = INDICATORS.filter((i) => pref.ids.includes(i.id));
  const snap = useSnapshot(shown.map((i) => i.sym));
  const compact = pref.collapsed;
  const toggleId = (id: string) => setPref({ ...pref, ids: pref.ids.includes(id) ? pref.ids.filter((x) => x !== id) : [...pref.ids, id] });

  return (
    <div className={`relative flex w-full items-stretch border-y border-white/[0.06] bg-[var(--oasis-panel)] ${compact ? "h-6" : "h-9"}`}>
      <span className="flex flex-none items-center border-r border-white/[0.06] pl-3 pr-3 font-mono text-[9.5px] font-bold tracking-[0.18em] text-zinc-500" title="Live market indicators · updates every minute">
        MARKETS
      </span>
      {/* stable row: values update in place; on narrow screens it scrolls sideways inside the strip */}
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shown.map((it) => {
          const k = it.sym.toUpperCase();
          return <Cell key={it.id} it={it} s={snap[k] ?? (snapLoaded(k) ? null : undefined)} compact={compact} />;
        })}
        {!shown.length && <span className="flex items-center px-4 font-mono text-[10.5px] text-zinc-600">No indicators selected — use ⚙ to pick some.</span>}
      </div>

      {menu && <button type="button" aria-label="Close indicator menu" onClick={() => setMenu(false)} className="fixed inset-0 z-[59] cursor-default" />}
      {menu && (
        <div className="absolute right-2 top-full z-[60] mt-1 w-[300px] rounded-sm border border-white/[0.08] bg-[var(--oasis-panel)] p-3 font-mono shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)]">
          <div className="mb-2 flex items-center justify-between text-[9.5px] font-bold tracking-[0.16em] text-zinc-500">
            <span>MARKET INDICATORS</span>
            <button type="button" onClick={() => setPref({ ...pref, ids: DEFAULT_IDS })} className="text-zinc-500 hover:text-white">RESET</button>
          </div>
          {(["EQUITY", "RATES", "MACRO"] as const).map((g) => (
            <div key={g} className="mb-2">
              <div className="mb-1 text-[9px] tracking-[0.16em] text-zinc-600">{g === "RATES" ? "RATES · YIELD %, CHANGE IN BP" : g === "EQUITY" ? "EQUITY · LEVEL, 1D %, YTD %" : "MACRO · LEVEL, 1D %, YTD %"}</div>
              <div className="flex flex-wrap gap-1">
                {INDICATORS.filter((i) => i.group === g).map((i) => {
                  const on = pref.ids.includes(i.id);
                  return (
                    <button key={i.id} type="button" onClick={() => toggleId(i.id)} aria-pressed={on} title={i.hint}
                      className={`rounded-sm border px-2 py-0.5 text-[10.5px] transition-colors ${on ? "oasis-on" : "border-white/[0.06] bg-white/[0.03] text-zinc-400 hover:text-zinc-200"}`}>
                      {i.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="m-0 mt-1 text-[9.5px] leading-snug text-zinc-600">Quotes from Yahoo Finance, refreshed every minute. MSCI World is shown via its iShares ETF proxy (URTH).</p>
        </div>
      )}
    </div>
  );
}
