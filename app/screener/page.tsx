"use client";

import { useMemo, useState } from "react";

type Category = "All" | "Equity" | "Bonds" | "Commodities" | "Thematic";
interface ETF {
  ticker: string; name: string; provider: string; category: Exclude<Category, "All">;
  price: number; changePct: number; aumB: number; expense: number; yieldPct: number; ytd: number;
}

const MOCK_ETFS: ETF[] = [
  { ticker: "VOO", name: "Vanguard S&P 500 ETF", provider: "Vanguard", category: "Equity", price: 537.4, changePct: 0.42, aumB: 540, expense: 0.03, yieldPct: 1.3, ytd: 14.2 },
  { ticker: "IVV", name: "iShares Core S&P 500 ETF", provider: "BlackRock", category: "Equity", price: 587.1, changePct: 0.41, aumB: 560, expense: 0.03, yieldPct: 1.3, ytd: 14.1 },
  { ticker: "VTI", name: "Vanguard Total Stock Market", provider: "Vanguard", category: "Equity", price: 288.6, changePct: 0.38, aumB: 450, expense: 0.03, yieldPct: 1.4, ytd: 13.6 },
  { ticker: "QQQ", name: "Invesco QQQ Trust", provider: "Invesco", category: "Equity", price: 512.8, changePct: 1.12, aumB: 320, expense: 0.2, yieldPct: 0.6, ytd: 18.9 },
  { ticker: "XLK", name: "Technology Select Sector SPDR", provider: "State Street", category: "Thematic", price: 236.4, changePct: 1.65, aumB: 78, expense: 0.09, yieldPct: 0.7, ytd: 21.3 },
  { ticker: "SMH", name: "VanEck Semiconductor ETF", provider: "Other", category: "Thematic", price: 262.1, changePct: 2.48, aumB: 24, expense: 0.35, yieldPct: 0.4, ytd: 33.7 },
  { ticker: "XLE", name: "Energy Select Sector SPDR", provider: "State Street", category: "Equity", price: 87.2, changePct: -2.34, aumB: 36, expense: 0.09, yieldPct: 3.4, ytd: -2.1 },
  { ticker: "XBI", name: "SPDR S&P Biotech ETF", provider: "State Street", category: "Thematic", price: 89.6, changePct: -1.38, aumB: 6.5, expense: 0.35, yieldPct: 0.0, ytd: -4.8 },
  { ticker: "BND", name: "Vanguard Total Bond Market", provider: "Vanguard", category: "Bonds", price: 72.9, changePct: 0.08, aumB: 120, expense: 0.03, yieldPct: 3.6, ytd: 1.9 },
  { ticker: "AGG", name: "iShares Core U.S. Aggregate Bond", provider: "BlackRock", category: "Bonds", price: 98.7, changePct: 0.06, aumB: 118, expense: 0.03, yieldPct: 3.5, ytd: 1.7 },
  { ticker: "GLD", name: "SPDR Gold Shares", provider: "State Street", category: "Commodities", price: 243.7, changePct: 0.9, aumB: 62, expense: 0.4, yieldPct: 0.0, ytd: 27.4 },
  { ticker: "SLV", name: "iShares Silver Trust", provider: "BlackRock", category: "Commodities", price: 27.6, changePct: 1.74, aumB: 14, expense: 0.5, yieldPct: 0.0, ytd: 31.2 },
];

const CATEGORIES: Category[] = ["All", "Equity", "Bonds", "Commodities", "Thematic"];
const PROVIDERS = ["BlackRock", "Vanguard", "State Street", "Invesco"];
type SortKey = "aumB" | "changePct" | "expense" | "ytd";
type View = "table" | "heatmap";

const fmtPct = (c: number) => (c > 0 ? "+" : c < 0 ? "−" : "") + Math.abs(c).toFixed(2) + "%";
const fmtAum = (b: number) => (b >= 100 ? `$${b.toFixed(0)}B` : `$${b.toFixed(1)}B`);

function ChangeBadge({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <span className={`inline-block rounded-lg px-2 py-0.5 font-mono text-xs font-bold ${up ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
      {fmtPct(v)}
    </span>
  );
}

const tile = (c: number) =>
  c >= 1.5 ? "from-emerald-900 to-emerald-600"
  : c >= 0.5 ? "from-emerald-900/80 to-emerald-700"
  : c > 0.15 ? "from-emerald-900/55 to-emerald-700/75"
  : c >= -0.15 ? "from-slate-800 to-slate-600"
  : c > -1.5 ? "from-red-900 to-red-700"
  : "from-red-950 to-red-800";

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "bg-white/[0.14] text-zinc-50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14),0_0_14px_rgba(255,255,255,0.06)]"
          : "bg-white/[0.05] text-zinc-400 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

interface Filters { providers: string[]; maxExpense: number; minAum: number; }

function FilterDeck({ filters, setFilters, onReset }: { filters: Filters; setFilters: (f: Filters) => void; onReset: () => void }) {
  const label = "text-[11px] font-semibold tracking-[0.08em] text-zinc-500";
  const toggle = (p: string) =>
    setFilters({ ...filters, providers: filters.providers.includes(p) ? filters.providers.filter((x) => x !== p) : [...filters.providers, p] });
  return (
    <aside className="flex flex-col gap-6 self-start rounded-3xl border border-white/[0.04] bg-[#0a0a0c] p-5 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)]">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold tracking-tight text-zinc-50">Filters</span>
        <button type="button" onClick={onReset} className="text-xs text-zinc-500 transition-colors hover:text-white">Reset</button>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className={label}>PROVIDER</span>
        <div className="flex flex-col gap-1.5">
          {PROVIDERS.map((p) => {
            const on = filters.providers.includes(p);
            return (
              <button key={p} type="button" onClick={() => toggle(p)}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-[9px] text-left transition-colors hover:bg-white/10 ${on ? "bg-white/[0.05]" : ""}`}>
                <span className={`flex h-4 w-4 items-center justify-center rounded-[5px] border text-[10px] font-bold text-emerald-950 ${on ? "border-emerald-400 bg-emerald-400" : "border-white/[0.18]"}`}>{on ? "✓" : ""}</span>
                <span className={`text-[13px] ${on ? "text-neutral-200" : "text-zinc-500"}`}>{p}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex justify-between"><span className={label}>MAX EXPENSE RATIO</span><span className="font-mono text-xs text-zinc-300">{filters.maxExpense.toFixed(2)}%</span></div>
        <input type="range" min={0.03} max={0.6} step={0.01} value={filters.maxExpense}
          onChange={(e) => setFilters({ ...filters, maxExpense: +e.target.value })} className="h-1.5 w-full cursor-pointer accent-white" />
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex justify-between"><span className={label}>MIN AUM</span><span className="font-mono text-xs text-zinc-300">${filters.minAum}B</span></div>
        <input type="range" min={0} max={300} step={5} value={filters.minAum}
          onChange={(e) => setFilters({ ...filters, minAum: +e.target.value })} className="h-1.5 w-full cursor-pointer accent-white" />
      </div>
    </aside>
  );
}

export default function ScreenerPage() {
  const defaults: Filters = { providers: [...PROVIDERS, "Other"], maxExpense: 0.6, minAum: 0 };
  const [data] = useState<ETF[]>(MOCK_ETFS);
  const [category, setCategory] = useState<Category>("All");
  const [filters, setFilters] = useState<Filters>(defaults);
  const [sortKey, setSortKey] = useState<SortKey>("aumB");
  const [view, setView] = useState<View>("table");

  const rows = useMemo(
    () =>
      data
        .filter((e) => category === "All" || e.category === category)
        .filter((e) => filters.providers.includes(e.provider) && e.expense <= filters.maxExpense && e.aumB >= filters.minAum)
        .sort((a, b) => b[sortKey] - a[sortKey]),
    [data, category, filters, sortKey]
  );

  const th = "px-4 py-3 text-left text-[10px] font-semibold tracking-[0.1em] text-zinc-500";
  const sortable = (key: SortKey, text: string) => (
    <th className={`${th} cursor-pointer text-right transition-colors hover:text-white ${sortKey === key ? "text-white" : ""}`} onClick={() => setSortKey(key)}>
      {text}{sortKey === key ? " ↓" : ""}
    </th>
  );

  return (
    <div className="flex flex-1 flex-col bg-[#030303] font-sans text-neutral-200">
      <div className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-[260px_minmax(0,1fr)] gap-4 px-6 pb-6 pt-4 max-lg:grid-cols-1">
        <FilterDeck filters={filters} setFilters={setFilters} onReset={() => { setFilters(defaults); setCategory("All"); }} />

        <section className="flex min-w-0 flex-col gap-4 rounded-3xl border border-white/[0.04] bg-[#0a0a0c] p-5 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => <Pill key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Pill>)}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-zinc-600">{rows.length} funds</span>
              <div className="flex gap-0.5 rounded-xl border border-white/[0.04] bg-white/[0.04] p-[3px]">
                {(["table", "heatmap"] as View[]).map((v) => (
                  <button key={v} type="button" onClick={() => setView(v)}
                    className={`rounded-lg px-3 py-1 text-[11.5px] font-semibold transition-colors ${view === v ? "bg-white/[0.12] text-white" : "text-zinc-500 hover:text-white"}`}>
                    {v === "table" ? "Table" : "Heatmap"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {view === "table" ? (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-y-0.5">
                <thead>
                  <tr>
                    <th className={th}>TICKER</th>
                    <th className={th}>NAME</th>
                    <th className={`${th} text-right`}>PRICE</th>
                    {sortable("changePct", "1D %")}
                    {sortable("aumB", "AUM")}
                    {sortable("expense", "EXPENSE")}
                    {sortable("ytd", "YTD")}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.ticker} className="group cursor-pointer">
                      <td className="rounded-l-xl px-4 py-3 font-mono text-[13px] font-bold text-zinc-50 transition-colors group-hover:bg-white/[0.04]">{e.ticker}</td>
                      <td className="px-4 py-3 transition-colors group-hover:bg-white/[0.04]">
                        <div className="text-[13px] text-neutral-200">{e.name}</div>
                        <div className="text-[11px] text-zinc-600">{e.provider} · {e.category}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] tabular-nums text-neutral-300 transition-colors group-hover:bg-white/[0.04]">${e.price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right transition-colors group-hover:bg-white/[0.04]"><ChangeBadge v={e.changePct} /></td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] tabular-nums text-neutral-300 transition-colors group-hover:bg-white/[0.04]">{fmtAum(e.aumB)}</td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] tabular-nums text-zinc-400 transition-colors group-hover:bg-white/[0.04]">{e.expense.toFixed(2)}%</td>
                      <td className="rounded-r-xl px-4 py-3 text-right transition-colors group-hover:bg-white/[0.04]"><ChangeBadge v={e.ytd} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <div className="p-12 text-center text-[13px] text-zinc-500">No funds match the current filters.</div>}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-[1px]">
              {rows.map((e) => (
                <div key={e.ticker}
                  className={`flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[1px] bg-gradient-to-br transition-[transform,filter] duration-200 hover:z-10 hover:scale-[1.03] hover:brightness-125 ${tile(e.changePct)}`}>
                  <span className="font-mono text-lg font-bold text-white">{e.ticker}</span>
                  <span className="font-mono text-xs font-semibold text-white/85">{fmtPct(e.changePct)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}